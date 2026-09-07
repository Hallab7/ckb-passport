import { randomUUID } from "node:crypto";
import { ccc } from "@ckb-ccc/core";
import {
  completePreparedDidVerificationMethodUpdateFee,
  prepareDidVerificationMethodUpdate,
  resolveDidCell,
  type DidTransferFunction,
} from "@ckb-passport/siwd-verify";
import { getAddress, verifyMessage } from "ethers";
import {
  ApiError,
  DEFAULT_KEY_ID,
  getRuntime,
  optionalString,
  readFeeRateShannonsPerKw,
  requireString,
} from "./server-runtime";

const PUDGE_EXPLORER_BASE_URL = "https://pudge.explorer.nervos.org";
const CHALLENGE_TTL_MS = 5 * 60_000;
const EVM_OMNILOCK_FLAGS = new Set([0x01, 0x12]);

type WalletUpdateChallenge = {
  did: string;
  keyId: string;
  didKey: string;
  evmAccount: string;
  tx: ccc.Transaction;
  position: number;
  signingMessage: string;
  capacityShannons?: string;
  feeRateShannonsPerKw: string;
  feePaidShannons: string;
  expiresAt: number;
};

type WalletUpdateChallengeStore = Map<string, WalletUpdateChallenge>;

type WalletUpdateGlobals = typeof globalThis & {
  __ckbPassportWalletUpdateChallenges?: WalletUpdateChallengeStore;
};

type PrepareWalletDidUpdateOptions = {
  body: Record<string, unknown>;
  client: ccc.Client;
  transfer?: DidTransferFunction;
  store?: WalletUpdateChallengeStore;
  now?: () => number;
  challengeId?: () => string;
};

type SubmitWalletDidUpdateOptions = {
  body: Record<string, unknown>;
  client: ccc.Client;
  store?: WalletUpdateChallengeStore;
  now?: () => number;
};

const walletUpdateGlobals = globalThis as WalletUpdateGlobals;

export const walletUpdateChallenges =
  walletUpdateGlobals.__ckbPassportWalletUpdateChallenges ??
  new Map<string, WalletUpdateChallenge>();
walletUpdateGlobals.__ckbPassportWalletUpdateChallenges = walletUpdateChallenges;

export function createWalletUpdateChallengeStore(): WalletUpdateChallengeStore {
  return new Map<string, WalletUpdateChallenge>();
}

export async function prepareWalletDidUpdateFromUi(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { client } = await getRuntime();
  return prepareWalletDidUpdate({ body, client });
}

export async function submitWalletDidUpdateFromUi(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { client } = await getRuntime();
  return submitWalletDidUpdate({ body, client });
}

export async function prepareWalletDidUpdate({
  body,
  client,
  transfer,
  store = walletUpdateChallenges,
  now = Date.now,
  challengeId = randomUUID,
}: PrepareWalletDidUpdateOptions): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  pruneExpiredChallenges(store, now());

  const did = requireString(body, "did");
  const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
  const didKey = requireString(body, "didKey");
  const requestedAccount = readEvmAccount(body.evmAccount);
  const feeRate = readFeeRateShannonsPerKw(body.feeRate);
  const lockInfo = await resolveDidOmniLockEvmAccount(client, did);

  if (lockInfo.evmAccount.toLowerCase() !== requestedAccount.toLowerCase()) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_lock_wallet_mismatch",
        message: "Connected EVM wallet does not control this DID OmniLock",
        did,
        keyId,
        expectedAccount: redactHex(lockInfo.evmAccount),
        connectedAccount: redactHex(requestedAccount),
        lockKind: "omnilock-evm",
      },
    };
  }

  const signer = new ccc.SignerEvmAddressReadonly(client, requestedAccount);
  const prepared = await prepareDidVerificationMethodUpdate({
    client,
    did,
    keyId,
    didKey,
    transfer,
  });
  if (!prepared.ok) {
    return {
      status: 400,
      body: prepared,
    };
  }

  try {
    const feeResult = await completePreparedDidVerificationMethodUpdateFee({
      client,
      signer,
      prepared,
      feeRate,
    });
    const signHashInfo = await prepared.tx.getSignHashInfo(lockInfo.lock, client);
    if (!signHashInfo) {
      throw new ApiError(
        400,
        "did_update_sign_hash_unavailable",
        "Prepared transaction does not contain the DID OmniLock input",
      );
    }

    const signingMessage = buildOmniLockEvmSigningMessage(signHashInfo.message);
    const id = challengeId();
    const expiresAt = now() + CHALLENGE_TTL_MS;
    store.set(id, {
      did,
      keyId,
      didKey,
      evmAccount: requestedAccount,
      tx: prepared.tx,
      position: signHashInfo.position,
      signingMessage,
      capacityShannons: prepared.capacityShannons,
      feeRateShannonsPerKw: feeResult.feeRateShannonsPerKw,
      feePaidShannons: feeResult.feePaidShannons,
      expiresAt,
    });

    return {
      status: 200,
      body: {
        ok: true,
        did,
        keyId,
        didKey,
        challengeId: id,
        evmAccount: requestedAccount,
        lockKind: "omnilock-evm",
        signingMessage,
        capacityShannons: prepared.capacityShannons,
        feeRateShannonsPerKw: feeResult.feeRateShannonsPerKw,
        feePaidShannons: feeResult.feePaidShannons,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_update_prepare_failed",
        message:
          error instanceof Error
            ? `Wallet DID update could not be prepared: ${error.message}`
            : "Wallet DID update could not be prepared",
        did,
        keyId,
        didKey,
      },
    };
  }
}

export async function submitWalletDidUpdate({
  body,
  client,
  store = walletUpdateChallenges,
  now = Date.now,
}: SubmitWalletDidUpdateOptions): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  pruneExpiredChallenges(store, now());

  const challengeId = requireString(body, "challengeId");
  const evmAccount = readEvmAccount(body.evmAccount);
  const signature = requireString(body, "signature");
  const challenge = store.get(challengeId);

  if (!challenge) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_update_challenge_missing",
        message: "Wallet signing challenge was not found or has expired",
      },
    };
  }
  if (challenge.expiresAt <= now()) {
    store.delete(challengeId);
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_update_challenge_expired",
        message: "Wallet signing challenge has expired",
      },
    };
  }
  if (challenge.evmAccount.toLowerCase() !== evmAccount.toLowerCase()) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_update_challenge_account_mismatch",
        message: "Submitted wallet account does not match the prepared challenge",
        expectedAccount: redactHex(challenge.evmAccount),
        connectedAccount: redactHex(evmAccount),
      },
    };
  }

  try {
    verifyEvmWalletSignature(challenge.signingMessage, signature, challenge.evmAccount);
    applyOmniLockEvmSignature(
      challenge.tx,
      challenge.position,
      normalizeRecoverableEvmSignature(signature),
    );
    const txHash = await client.sendTransaction(challenge.tx);
    const confirmedTransaction = await client.waitTransaction(
      txHash,
      0,
      120_000,
      2_000,
    );
    store.delete(challengeId);

    return {
      status: 200,
      body: {
        ok: true,
        did: challenge.did,
        keyId: challenge.keyId,
        didKey: challenge.didKey,
        txHash,
        confirmed: true,
        blockNumber:
          confirmedTransaction?.blockNumber == null
            ? null
            : confirmedTransaction.blockNumber.toString(),
        capacityShannons: challenge.capacityShannons,
        feeRateShannonsPerKw: challenge.feeRateShannonsPerKw,
        feePaidShannons: challenge.feePaidShannons,
        signerKind: "omnilock-evm-wallet",
        explorerUrl: `${PUDGE_EXPLORER_BASE_URL}/transaction/${txHash}`,
      },
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        ok: false,
        code:
          error instanceof ApiError
            ? error.code
            : "did_update_wallet_submit_failed",
        message:
          error instanceof Error
            ? error.message
            : "Wallet DID update could not be submitted",
        did: challenge.did,
        keyId: challenge.keyId,
        didKey: challenge.didKey,
      },
    };
  }
}

export function buildOmniLockEvmSigningMessage(signHash: string): string {
  return `CKB transaction: ${signHash}`;
}

export function readOmniLockEvmAccountFromLock(lock: ccc.Script): string {
  const args = ccc.bytesFrom(lock.args);
  const flag = args[0];
  if (
    args.length !== 22 ||
    !EVM_OMNILOCK_FLAGS.has(flag) ||
    args[21] !== 0x00
  ) {
    throw new ApiError(
      400,
      "did_lock_not_omnilock_evm",
      "This DID is not controlled by an EVM OmniLock account",
    );
  }
  return getAddress(ccc.hexFrom(args.slice(1, 21)));
}

export function verifyEvmWalletSignature(
  message: string,
  signature: string,
  expectedAccount: string,
): string {
  let recovered: string;
  try {
    recovered = getAddress(verifyMessage(message, signature));
  } catch {
    throw new ApiError(
      400,
      "did_update_wallet_signature_invalid",
      "Wallet signature is not a valid personal_sign signature",
    );
  }

  if (recovered.toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new ApiError(
      400,
      "did_update_wallet_signature_mismatch",
      "Wallet signature does not recover to the DID OmniLock account",
    );
  }
  return recovered;
}

export function normalizeRecoverableEvmSignature(signature: string): Uint8Array {
  const bytes = Uint8Array.from(ccc.bytesFrom(signature));
  if (bytes.length !== 65) {
    throw new ApiError(
      400,
      "did_update_wallet_signature_invalid",
      "Wallet signature must be a 65-byte recoverable EVM signature",
    );
  }
  if (bytes[64] >= 27) {
    bytes[64] -= 27;
  }
  return bytes;
}

export function applyOmniLockEvmSignature(
  tx: ccc.Transaction,
  witnessIndex: number,
  signature: Uint8Array,
): void {
  const witness = ccc.WitnessArgs.fromBytes(tx.witnesses[witnessIndex]);
  witness.lock = ccc.hexFrom(
    ccc.bytesConcat(
      ccc.numToBytes(5 * 4 + signature.length, 4),
      ccc.numToBytes(4 * 4, 4),
      ccc.numToBytes(5 * 4 + signature.length, 4),
      ccc.numToBytes(5 * 4 + signature.length, 4),
      ccc.numToBytes(signature.length, 4),
      signature,
    ),
  );
  tx.setWitnessArgs(witnessIndex, witness);
}

async function resolveDidOmniLockEvmAccount(
  client: ccc.Client,
  did: string,
): Promise<{ lock: ccc.Script; evmAccount: string }> {
  const resolution = await resolveDidCell({ client, did });
  if (!resolution.ok) {
    throw new ApiError(
      400,
      "did_cell_resolve_failed",
      resolution.message,
    );
  }

  const omniLockInfo = await client.getKnownScript(ccc.KnownScript.OmniLock);
  const lock = resolution.cell.cellOutput.lock;
  if (
    lock.codeHash.toLowerCase() !== omniLockInfo.codeHash.toLowerCase() ||
    lock.hashType !== omniLockInfo.hashType
  ) {
    throw new ApiError(
      400,
      "did_lock_not_omnilock_evm",
      "This DID is not controlled by an EVM OmniLock account",
    );
  }

  return {
    lock,
    evmAccount: readOmniLockEvmAccountFromLock(lock),
  };
}

function readEvmAccount(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(
      400,
      "evm_account_invalid",
      "evmAccount must be a valid EVM address",
    );
  }
  try {
    return getAddress(value.trim());
  } catch {
    throw new ApiError(
      400,
      "evm_account_invalid",
      "evmAccount must be a valid EVM address",
    );
  }
}

function pruneExpiredChallenges(
  store: WalletUpdateChallengeStore,
  now: number,
): void {
  for (const [id, challenge] of store.entries()) {
    if (challenge.expiresAt <= now) {
      store.delete(id);
    }
  }
}

function redactHex(value: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

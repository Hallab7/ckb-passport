import { ccc } from "@ckb-ccc/core";
import { resolveDidCell } from "@ckb-passport/siwd-verify";
import { Wallet } from "ethers";

export type DidLockSignerKind = "ckb-secp256k1" | "omnilock-evm";

export type DidLockSignerResult =
  | {
      ok: true;
      signer: ccc.Signer;
      kind: DidLockSignerKind;
    }
  | {
      ok: false;
      code:
        | "did_cell_resolve_failed"
        | "did_lock_private_key_invalid"
        | "did_lock_private_key_mismatch"
        | "did_lock_unsupported";
      message: string;
      lockKind?: string;
      expectedAccount?: string;
      providedAccount?: string;
    };

export async function createDidLockSignerFromPrivateKey(options: {
  client: ccc.Client;
  did: string;
  privateKey: string;
}): Promise<DidLockSignerResult> {
  const resolution = await resolveDidCell({
    client: options.client,
    did: options.did,
  });
  if (!resolution.ok) {
    return {
      ok: false,
      code: "did_cell_resolve_failed",
      message: resolution.message,
    };
  }

  const lock = resolution.cell.cellOutput.lock;
  const [secpInfo, omniInfo] = await Promise.all([
    options.client.getKnownScript(ccc.KnownScript.Secp256k1Blake160),
    options.client.getKnownScript(ccc.KnownScript.OmniLock),
  ]);

  if (matchesKnownScript(lock, secpInfo)) {
    return createCkbSecpSigner({
      client: options.client,
      privateKey: options.privateKey,
      expectedLock: lock,
    });
  }

  if (matchesKnownScript(lock, omniInfo)) {
    return createOmniLockEvmSigner({
      client: options.client,
      privateKey: options.privateKey,
      lock,
      omniCodeHash: omniInfo.codeHash,
    });
  }

  return {
    ok: false,
    code: "did_lock_unsupported",
    message: "DID lock script is not supported by the demo signer",
    lockKind: "unknown",
  };
}

class EvmPrivateKeySigner extends ccc.SignerEvm {
  private readonly wallet: Wallet;

  constructor(client: ccc.Client, privateKey: string) {
    super(client);
    this.wallet = new Wallet(privateKey);
  }

  async connect(): Promise<void> {}

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getEvmAccount(): Promise<ccc.Hex> {
    return ccc.hexFrom(this.wallet.address);
  }

  async signMessageRaw(message: string | ccc.BytesLike): Promise<string> {
    return this.wallet.signMessage(
      typeof message === "string" ? message : ccc.bytesFrom(message),
    );
  }
}

async function createCkbSecpSigner(options: {
  client: ccc.Client;
  privateKey: string;
  expectedLock: ccc.Script;
}): Promise<DidLockSignerResult> {
  let signer: ccc.SignerCkbPrivateKey;
  try {
    signer = new ccc.SignerCkbPrivateKey(options.client, options.privateKey);
  } catch (error) {
    return privateKeyInvalid(error);
  }

  const actualLock = (await signer.getAddressObjSecp256k1()).script;
  if (!actualLock.eq(options.expectedLock)) {
    return {
      ok: false,
      code: "did_lock_private_key_mismatch",
      message: "Private key does not control the DID cell's CKB secp256k1 lock",
      lockKind: "ckb-secp256k1",
    };
  }

  return {
    ok: true,
    signer,
    kind: "ckb-secp256k1",
  };
}

async function createOmniLockEvmSigner(options: {
  client: ccc.Client;
  privateKey: string;
  lock: ccc.Script;
  omniCodeHash: string;
}): Promise<DidLockSignerResult> {
  const lockArgs = ccc.bytesFrom(options.lock.args);
  const authFlag = lockArgs[0];
  if (
    lockArgs.length !== 22 ||
    lockArgs[21] !== 0x00 ||
    (authFlag !== 0x12 && authFlag !== 0x01)
  ) {
    return {
      ok: false,
      code: "did_lock_unsupported",
      message: "DID OmniLock mode is not supported by the demo signer",
      lockKind: "omnilock-unsupported",
    };
  }

  let signer: EvmPrivateKeySigner;
  try {
    signer = new EvmPrivateKeySigner(options.client, options.privateKey);
  } catch (error) {
    return privateKeyInvalid(error);
  }

  const expectedAccount = ccc.hexFrom(lockArgs.slice(1, 21));
  const providedAccount = await signer.getEvmAccount();
  if (providedAccount.toLowerCase() !== expectedAccount.toLowerCase()) {
    return {
      ok: false,
      code: "did_lock_private_key_mismatch",
      message:
        options.privateKey.toLowerCase() === options.omniCodeHash.toLowerCase()
          ? "Provided value is the OmniLock code hash, not the EVM private key that controls this DID"
          : "Private key does not control the DID cell's OmniLock EVM account",
      lockKind: "omnilock-evm",
      expectedAccount: redactHex(expectedAccount),
      providedAccount: redactHex(providedAccount),
    };
  }

  return {
    ok: true,
    signer,
    kind: "omnilock-evm",
  };
}

function matchesKnownScript(
  script: ccc.Script,
  scriptInfo: ccc.ScriptInfo,
): boolean {
  return (
    script.codeHash === scriptInfo.codeHash &&
    script.hashType === scriptInfo.hashType
  );
}

function privateKeyInvalid(error: unknown): DidLockSignerResult {
  return {
    ok: false,
    code: "did_lock_private_key_invalid",
    message:
      error instanceof Error ? error.message : "DID lock private key is invalid",
  };
}

function redactHex(value: string): string {
  return value.length > 18
    ? `${value.slice(0, 10)}...${value.slice(-8)}`
    : value;
}

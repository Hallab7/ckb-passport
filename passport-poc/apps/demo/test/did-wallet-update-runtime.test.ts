import { ccc } from "@ckb-ccc/core";
import { encodeDidKey } from "@ckb-passport/siwd-core";
import { argsToDid } from "@ckb-ccc/did-ckb";
import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import {
  applyOmniLockEvmSignature,
  buildOmniLockEvmSigningMessage,
  createWalletUpdateChallengeStore,
  normalizeRecoverableEvmSignature,
  prepareWalletDidUpdate,
  readOmniLockEvmAccountFromLock,
  submitWalletDidUpdate,
  verifyEvmWalletSignature,
} from "../lib/did-wallet-update-runtime";

const didId = `0x${"11".repeat(20)}`;
const did = argsToDid(didId);
const didCodeHash = `0x${"51".repeat(32)}`;
const omniCodeHash =
  "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb";
const wallet = new Wallet(
  "0x0202020202020202020202020202020202020202020202020202020202020202",
);
const didKey = encodeDidKey(
  "p256",
  Uint8Array.from([0x02, ...new Array(32).fill(0x33)]),
);

describe("wallet DID update runtime", () => {
  it("prepares a wallet challenge, verifies the EVM signature, and submits the signed transaction", async () => {
    let submittedTx: ccc.Transaction | undefined;
    const lock = omniLockFor(wallet.address);
    const cell = fakeDidCell(lock);
    const client = fakeClient([cell], async (txLike) => {
      submittedTx = ccc.Transaction.from(txLike);
      return `0x${"bb".repeat(32)}`;
    });
    const store = createWalletUpdateChallengeStore();

    const prepared = await prepareWalletDidUpdate({
      body: {
        did,
        keyId: "auth-1",
        didKey,
        evmAccount: wallet.address,
        feeRate: "1000",
      },
      client,
      store,
      challengeId: () => "challenge-1",
      transfer: async () => ({
        tx: fakeUpdateTx(cell),
        inIndex: 0,
        outIndex: 0,
      }),
    });

    if (prepared.status !== 200) {
      throw new Error(JSON.stringify(prepared.body, null, 2));
    }
    expect(prepared.body).toMatchObject({
      ok: true,
      challengeId: "challenge-1",
      evmAccount: wallet.address,
      feeRateShannonsPerKw: "1000",
    });

    const signature = await wallet.signMessage(
      String(prepared.body.signingMessage),
    );
    const submitted = await submitWalletDidUpdate({
      body: {
        challengeId: "challenge-1",
        evmAccount: wallet.address,
        signature,
      },
      client,
      store,
    });

    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({
      ok: true,
      did,
      keyId: "auth-1",
      didKey,
      txHash: `0x${"bb".repeat(32)}`,
      signerKind: "omnilock-evm-wallet",
    });
    expect(store.size).toBe(0);

    const expectedSignature = ccc.hexFrom(normalizeRecoverableEvmSignature(signature));
    const witness = ccc.WitnessArgs.fromBytes(submittedTx?.witnesses[0] ?? "0x");
    expect(witness.lock?.endsWith(expectedSignature.slice(2))).toBe(true);
  });

  it("rejects a connected wallet that does not match the DID OmniLock account", async () => {
    const otherWallet = Wallet.createRandom();
    const response = await prepareWalletDidUpdate({
      body: {
        did,
        didKey,
        evmAccount: otherWallet.address,
      },
      client: fakeClient([fakeDidCell(omniLockFor(wallet.address))]),
      store: createWalletUpdateChallengeStore(),
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: "did_lock_wallet_mismatch",
      lockKind: "omnilock-evm",
    });
    expect(String(response.body.expectedAccount)).toContain("...");
  });

  it("reads OmniLock EVM args and rejects invalid wallet signatures", async () => {
    const lock = omniLockFor(wallet.address);
    const message = buildOmniLockEvmSigningMessage(`0x${"ab".repeat(32)}`);
    const signature = await wallet.signMessage(message);

    expect(readOmniLockEvmAccountFromLock(lock)).toBe(wallet.address);
    expect(verifyEvmWalletSignature(message, signature, wallet.address)).toBe(
      wallet.address,
    );
    expect(() =>
      verifyEvmWalletSignature(message, signature, Wallet.createRandom().address),
    ).toThrow("Wallet signature does not recover to the DID OmniLock account");
  });

  it("applies an OmniLock witness matching CCC's EVM signature layout", async () => {
    const tx = ccc.Transaction.from({
      witnesses: [ccc.WitnessArgs.from({ lock: `0x${"00".repeat(85)}` }).toHex()],
    });
    const signature = Uint8Array.from(new Array(65).fill(0x11));

    applyOmniLockEvmSignature(tx, 0, signature);

    const witness = ccc.WitnessArgs.fromBytes(tx.witnesses[0]);
    expect(ccc.bytesFrom(witness.lock ?? "0x")).toHaveLength(85);
    expect(witness.lock?.endsWith(ccc.hexFrom(signature).slice(2))).toBe(true);
  });
});

function fakeClient(
  cells: ccc.Cell[],
  sendTransaction: (tx: ccc.TransactionLike) => Promise<string> = async () =>
    `0x${"bb".repeat(32)}`,
): ccc.Client {
  const scripts: Partial<Record<ccc.KnownScript, ccc.ScriptInfoLike>> = {
    [ccc.KnownScript.DidCkb]: {
      codeHash: didCodeHash,
      hashType: "type",
      cellDeps: [],
    },
    [ccc.KnownScript.OmniLock]: {
      codeHash: omniCodeHash,
      hashType: "type",
      cellDeps: [],
    },
    [ccc.KnownScript.PWLock]: {
      codeHash: `0x${"9a".repeat(32)}`,
      hashType: "type",
      cellDeps: [],
    },
    [ccc.KnownScript.NervosDao]: {
      codeHash: `0x${"82".repeat(32)}`,
      hashType: "type",
      cellDeps: [],
    },
  };

  return {
    addressPrefix: "ckt",
    getKnownScript: async (script: ccc.KnownScript) => {
      const info = scripts[script];
      if (!info) {
        throw new Error(`unsupported known script ${script}`);
      }
      return info;
    },
    getCellDeps: async () => [],
    findCellsByType: async function* () {
      for (const cell of cells) {
        yield cell;
      }
    },
    sendTransaction,
  } as unknown as ccc.Client;
}

function fakeDidCell(lock: ccc.Script): ccc.Cell {
  return ccc.Cell.from({
    outPoint: {
      txHash: `0x${"33".repeat(32)}`,
      index: 0,
    },
    cellOutput: {
      capacity: 10_000_000_000n,
      lock,
      type: {
        codeHash: didCodeHash,
        hashType: "type",
        args: didId,
      },
    },
    outputData: "0x",
  });
}

function fakeUpdateTx(cell: ccc.Cell): ccc.Transaction {
  const tx = ccc.Transaction.from({});
  tx.addInput(cell);
  tx.addOutput(cell.cellOutput, cell.outputData);
  return tx;
}

function omniLockFor(account: string): ccc.Script {
  return ccc.Script.from({
    codeHash: omniCodeHash,
    hashType: "type",
    args: ccc.hexFrom([0x12, ...ccc.bytesFrom(account), 0x00]),
  });
}

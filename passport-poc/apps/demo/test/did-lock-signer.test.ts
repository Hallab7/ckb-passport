import { ccc } from "@ckb-ccc/core";
import { argsToDid } from "@ckb-ccc/did-ckb";
import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import { createDidLockSignerFromPrivateKey } from "../lib/did-lock-signer";

const didId = `0x${"11".repeat(20)}`;
const did = argsToDid(didId);
const didCodeHash = `0x${"51".repeat(32)}`;
const secpCodeHash = `0x${"9b".repeat(32)}`;
const omniCodeHash =
  "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb";
const ckbPrivateKey =
  "0x0101010101010101010101010101010101010101010101010101010101010101";
const evmPrivateKey =
  "0x0202020202020202020202020202020202020202020202020202020202020202";

describe("createDidLockSignerFromPrivateKey", () => {
  it("selects a CKB signer when the DID cell uses a standard secp256k1 lock", async () => {
    const baseClient = fakeClient([]);
    const signer = new ccc.SignerCkbPrivateKey(baseClient, ckbPrivateKey);
    const lock = (await signer.getAddressObjSecp256k1()).script;
    const result = await createDidLockSignerFromPrivateKey({
      client: fakeClient([fakeDidCell(lock)]),
      did,
      privateKey: ckbPrivateKey,
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "ckb-secp256k1",
    });
  });

  it("selects an EVM signer when the DID cell uses OmniLock EVM auth", async () => {
    const wallet = new Wallet(evmPrivateKey);
    const result = await createDidLockSignerFromPrivateKey({
      client: fakeClient([fakeDidCell(omniLockFor(wallet.address))]),
      did,
      privateKey: evmPrivateKey,
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "omnilock-evm",
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    await expect(result.signer.getInternalAddress()).resolves.toBe(
      wallet.address.toLowerCase(),
    );
  });

  it("rejects the OmniLock code hash when it is supplied as a private key", async () => {
    const wallet = new Wallet(evmPrivateKey);
    const result = await createDidLockSignerFromPrivateKey({
      client: fakeClient([fakeDidCell(omniLockFor(wallet.address))]),
      did,
      privateKey: omniCodeHash,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_lock_private_key_mismatch",
      lockKind: "omnilock-evm",
      message:
        "Provided value is the OmniLock code hash, not the EVM private key that controls this DID",
    });
  });
});

function fakeClient(cells: ccc.Cell[]): ccc.Client {
  const scripts: Partial<Record<ccc.KnownScript, ccc.ScriptInfoLike>> = {
    [ccc.KnownScript.DidCkb]: {
      codeHash: didCodeHash,
      hashType: "type",
      cellDeps: [],
    },
    [ccc.KnownScript.Secp256k1Blake160]: {
      codeHash: secpCodeHash,
      hashType: "type",
      cellDeps: [],
    },
    [ccc.KnownScript.OmniLock]: {
      codeHash: omniCodeHash,
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
    findCellsByType: async function* () {
      for (const cell of cells) {
        yield cell;
      }
    },
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

function omniLockFor(account: string): ccc.Script {
  return ccc.Script.from({
    codeHash: omniCodeHash,
    hashType: "type",
    args: ccc.hexFrom([0x12, ...ccc.bytesFrom(account), 0x00]),
  });
}

import { encodeDidKey } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData, argsToDid } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import {
  completePreparedDidVerificationMethodUpdateFee,
  prepareDidVerificationMethodUpdate,
  submitDidVerificationMethodUpdate,
  upsertP256VerificationMethod,
  type DidTransferFunction,
} from "../src/index.js";

const didId = `0x${"11".repeat(20)}`;
const did = argsToDid(didId);
const didKey = encodeDidKey(
  "p256",
  Uint8Array.from([0x02, ...new Array(32).fill(0x33)]),
);
const secpDidKey = encodeDidKey(
  "secp256k1",
  Uint8Array.from([0x02, ...new Array(32).fill(0x44)]),
);
const lock = ccc.Script.from({
  codeHash: `0x${"aa".repeat(32)}`,
  hashType: "type",
  args: "0x",
});

describe("upsertP256VerificationMethod", () => {
  it("adds auth-1 without changing other document fields", () => {
    const result = upsertP256VerificationMethod(
      {
        verificationMethods: {
          wallet: secpDidKey,
        },
        alsoKnownAs: ["at://alice.test"],
        services: {},
      },
      didKey,
    );

    expect(result).toMatchObject({
      ok: true,
      keyId: "auth-1",
      didKey,
      document: {
        verificationMethods: {
          wallet: secpDidKey,
          "auth-1": didKey,
        },
        alsoKnownAs: ["at://alice.test"],
        services: {},
      },
    });
  });

  it("replaces an existing method and reports the previous value", () => {
    const result = upsertP256VerificationMethod(
      {
        verificationMethods: {
          "auth-1": secpDidKey,
        },
      },
      didKey,
    );

    expect(result).toMatchObject({
      ok: true,
      previousDidKey: secpDidKey,
      document: {
        verificationMethods: {
          "auth-1": didKey,
        },
      },
    });
  });

  it("adds auth-1 to a DID document that has no verification methods yet", () => {
    const result = upsertP256VerificationMethod(
      {
        alsoKnownAs: ["at://empty-methods.test"],
      },
      didKey,
    );

    expect(result).toMatchObject({
      ok: true,
      previousDidKey: undefined,
      document: {
        verificationMethods: {
          "auth-1": didKey,
        },
        alsoKnownAs: ["at://empty-methods.test"],
      },
    });
  });

  it("rejects non-P-256 did:key values for passkey registration", () => {
    expect(
      upsertP256VerificationMethod({ verificationMethods: {} }, secpDidKey),
    ).toEqual({
      ok: false,
      code: "did_key_not_p256",
      message: "passkey registration must write a P-256 did:key",
      keyId: "auth-1",
      didKey: secpDidKey,
    });
  });

  it("rejects malformed key IDs", () => {
    expect(
      upsertP256VerificationMethod({ verificationMethods: {} }, didKey, "bad key"),
    ).toMatchObject({
      ok: false,
      code: "key_id_invalid",
    });
  });
});

describe("prepareDidVerificationMethodUpdate", () => {
  it("uses the current DID cell lock and prepares transformed SDK data", async () => {
    const cell = fakeCell(lock, 10_000_000_000n);
    const sourceDocument = {
      verificationMethods: {
        wallet: secpDidKey,
      },
    };
    let transferCalled = false;
    const transfer: DidTransferFunction = async (props) => {
      transferCalled = true;
      expect(props.id).toBe(didId);
      expect(props.receiver).toEqual(lock);
      expect(typeof props.data).toBe("function");

      if (typeof props.data !== "function") {
        throw new Error("expected transformer");
      }

      const nextData = DidCkbData.from(
        await props.data(
          cell,
          DidCkbData.fromV1({
            document: sourceDocument,
            localId: "local-1",
          }),
        ),
      );

      expect(nextData.value.localId).toBe("local-1");
      expect(nextData.value.document).toEqual({
        verificationMethods: {
          wallet: secpDidKey,
          "auth-1": didKey,
        },
      });

      return {
        tx: ccc.Transaction.from({}),
        inIndex: 0,
        outIndex: 0,
      };
    };

    const result = await prepareDidVerificationMethodUpdate({
      client: fakeClient([cell]),
      did,
      didKey,
      transfer,
    });

    expect(transferCalled).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      did,
      id: didId,
      keyId: "auth-1",
      didKey,
      capacityShannons: "10000000000",
    });
  });

  it("fails closed before transfer when the DID has no live cell", async () => {
    let transferCalled = false;
    const transfer: DidTransferFunction = async () => {
      transferCalled = true;
      return {
        tx: ccc.Transaction.from({}),
        inIndex: 0,
        outIndex: 0,
      };
    };

    const result = await prepareDidVerificationMethodUpdate({
      client: fakeClient([]),
      did,
      didKey,
      transfer,
    });

    expect(transferCalled).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      code: "did_cell_resolve_failed",
    });
  });
});

describe("submitDidVerificationMethodUpdate", () => {
  it("exposes fee completion for externally signed prepared transactions", async () => {
    const cell = fakeCell(lock, 10_000_000_000n);
    const client = fakeClient([cell]);
    const prepared = await prepareDidVerificationMethodUpdate({
      client,
      did,
      didKey,
      transfer: async () => ({
        tx: fakeUpdateTx(cell),
        inIndex: 0,
        outIndex: 0,
      }),
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error(prepared.message);
    }

    const result = await completePreparedDidVerificationMethodUpdateFee({
      client,
      prepared,
      feeRate: 1000n,
      signer: fakeSigner(client, async () => `0x${"bb".repeat(32)}`),
    });

    expect(result.feeRateShannonsPerKw).toBe("1000");
    expect(BigInt(result.feePaidShannons) > 0n).toBe(true);
    expect(prepared.tx.outputs[0].capacity < 10_000_000_000n).toBe(true);
  });

  it("completes a positive fee before submitting the prepared transaction", async () => {
    const cell = fakeCell(lock, 10_000_000_000n);
    const client = fakeClient([cell]);
    const transfer: DidTransferFunction = async () => ({
      tx: fakeUpdateTx(cell),
      inIndex: 0,
      outIndex: 0,
    });
    let feeAtSubmit = 0n;
    let outputCapacityAtSubmit = 0n;

    const result = await submitDidVerificationMethodUpdate({
      client,
      did,
      didKey,
      transfer,
      feeRate: 1000n,
      signer: fakeSigner(client, async (txLike) => {
        const tx = ccc.Transaction.from(txLike);
        feeAtSubmit = await tx.getFee(client);
        outputCapacityAtSubmit = tx.outputs[0].capacity;
        return `0x${"bb".repeat(32)}`;
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      txHash: `0x${"bb".repeat(32)}`,
      feeRateShannonsPerKw: "1000",
      feePaidShannons: feeAtSubmit.toString(),
    });
    expect(feeAtSubmit > 0n).toBe(true);
    expect(outputCapacityAtSubmit < 10_000_000_000n).toBe(true);
  });

  it("does not submit when preparation fails", async () => {
    let sendCalled = false;
    const client = fakeClient([]);
    const result = await submitDidVerificationMethodUpdate({
      client,
      did,
      didKey,
      signer: fakeSigner(client, async () => {
        sendCalled = true;
        return `0x${"bb".repeat(32)}`;
      }),
    });

    expect(sendCalled).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      code: "did_cell_resolve_failed",
    });
  });
});

function fakeClient(cells: ccc.Cell[]): ccc.Client {
  return {
    getKnownScript: async () => ({
      codeHash: `0x${"99".repeat(32)}`,
      hashType: "type",
    }),
    getCell: async () => undefined,
    findCellsByType: async function* () {
      for (const cell of cells) {
        yield cell;
      }
    },
  } as unknown as ccc.Client;
}

function fakeCell(lockScript: ccc.Script, capacity: bigint): ccc.Cell {
  return ccc.Cell.from({
    outPoint: {
      txHash: `0x${"22".repeat(32)}`,
      index: 0,
    },
    cellOutput: {
      capacity,
      lock: lockScript,
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

function fakeSigner(
  client: ccc.Client,
  sendTransaction: (tx: ccc.TransactionLike) => Promise<string>,
): ccc.Signer {
  return {
    client,
    prepareTransaction: async (tx: ccc.TransactionLike) => ccc.Transaction.from(tx),
    sendTransaction,
  } as unknown as ccc.Signer;
}

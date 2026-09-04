import { encodeDidKey } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData, argsToDid } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import {
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
    const cell = fakeCell(lock, 1_000_000_000n);
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
      capacityShannons: "1000000000",
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
  it("submits the prepared transaction through the caller-provided signer", async () => {
    const cell = fakeCell(lock, 1_000_000_000n);
    const transfer: DidTransferFunction = async () => ({
      tx: ccc.Transaction.from({}),
      inIndex: 0,
      outIndex: 0,
    });

    const result = await submitDidVerificationMethodUpdate({
      client: fakeClient([cell]),
      did,
      didKey,
      transfer,
      signer: {
        sendTransaction: async () => `0x${"bb".repeat(32)}`,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      txHash: `0x${"bb".repeat(32)}`,
    });
  });

  it("does not submit when preparation fails", async () => {
    let sendCalled = false;
    const result = await submitDidVerificationMethodUpdate({
      client: fakeClient([]),
      did,
      didKey,
      signer: {
        sendTransaction: async () => {
          sendCalled = true;
          return `0x${"bb".repeat(32)}`;
        },
      },
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
    findCellsByType: async function* () {
      for (const cell of cells) {
        yield cell;
      }
    },
  } as unknown as ccc.Client;
}

function fakeCell(lockScript: ccc.Script, capacity: bigint): ccc.Cell {
  return {
    cellOutput: {
      capacity,
      lock: lockScript,
    },
    outputData: "0x",
  } as unknown as ccc.Cell;
}

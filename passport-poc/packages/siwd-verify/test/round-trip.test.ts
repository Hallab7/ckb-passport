import { encodeDidKey } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData, argsToDid } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import { checkDidVerificationMethodRoundTrip } from "../src/index.js";

const didId = `0x${"12".repeat(20)}`;
const did = argsToDid(didId);
const didKey = encodeDidKey(
  "p256",
  Uint8Array.from([0x02, ...new Array(32).fill(0x55)]),
);
const otherDidKey = encodeDidKey(
  "p256",
  Uint8Array.from([0x03, ...new Array(32).fill(0x66)]),
);

describe("checkDidVerificationMethodRoundTrip", () => {
  it("passes when the re-resolved method matches byte-for-byte", async () => {
    const result = await checkDidVerificationMethodRoundTrip({
      client: fakeClient([
        fakeCell({
          verificationMethods: {
            "auth-1": didKey,
          },
        }),
      ]),
      did,
      expectedDidKey: didKey,
    });

    expect(result).toEqual({
      ok: true,
      did,
      keyId: "auth-1",
      expectedDidKey: didKey,
      foundDidKey: didKey,
    });
  });

  it("fails when the method is missing after re-resolution", async () => {
    const result = await checkDidVerificationMethodRoundTrip({
      client: fakeClient([
        fakeCell({
          verificationMethods: {},
        }),
      ]),
      did,
      expectedDidKey: didKey,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "verification_method_missing",
    });
  });

  it("fails when the stored did:key differs", async () => {
    const result = await checkDidVerificationMethodRoundTrip({
      client: fakeClient([
        fakeCell({
          verificationMethods: {
            "auth-1": otherDidKey,
          },
        }),
      ]),
      did,
      expectedDidKey: didKey,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_key_mismatch",
      foundDidKey: otherDidKey,
    });
  });

  it("fails closed when the DID has no live cell", async () => {
    const result = await checkDidVerificationMethodRoundTrip({
      client: fakeClient([]),
      did,
      expectedDidKey: didKey,
    });

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

function fakeCell(document: unknown): ccc.Cell {
  return {
    outputData: DidCkbData.encode(DidCkbData.fromV1({ document })),
  } as unknown as ccc.Cell;
}

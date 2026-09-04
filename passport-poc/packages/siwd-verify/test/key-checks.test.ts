import { encodeDidKey } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData, argsToDid } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import { verifySiwdKeyChecks } from "../src/index.js";

const did = argsToDid(`0x${"13".repeat(20)}`);
const p256DidKey = encodeDidKey(
  "p256",
  Uint8Array.from([0x02, ...new Array(32).fill(0x77)]),
);
const secpDidKey = encodeDidKey(
  "secp256k1",
  Uint8Array.from([0x03, ...new Array(32).fill(0x88)]),
);

describe("verifySiwdKeyChecks", () => {
  it("resolves the DID, decodes the document, and selects the key", async () => {
    const result = await verifySiwdKeyChecks({
      client: fakeClient([
        fakeCell({
          verificationMethods: {
            "auth-1": p256DidKey,
            wallet: secpDidKey,
          },
        }),
      ]),
      did,
      keyId: "auth-1",
    });

    expect(result).toMatchObject({
      ok: true,
      did,
      keyId: "auth-1",
      verificationMethod: {
        ok: true,
        didKey: p256DidKey,
        decoded: {
          curve: "p256",
        },
      },
    });
  });

  it("fails closed when the DID resolves to zero live cells", async () => {
    const result = await verifySiwdKeyChecks({
      client: fakeClient([]),
      did,
      keyId: "auth-1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_cell_resolve_failed",
    });
  });

  it("fails when keyId is absent from the DID document", async () => {
    const result = await verifySiwdKeyChecks({
      client: fakeClient([
        fakeCell({
          verificationMethods: {
            wallet: secpDidKey,
          },
        }),
      ]),
      did,
      keyId: "auth-1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "verification_method_missing",
    });
  });

  it("fails when the selected did:key uses an unsupported multicodec", async () => {
    const result = await verifySiwdKeyChecks({
      client: fakeClient([
        fakeCell({
          verificationMethods: {
            "auth-1": "did:key:z6MkiTBz1K9jDk4h6x3Va8r",
          },
        }),
      ]),
      did,
      keyId: "auth-1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "verification_method_invalid",
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

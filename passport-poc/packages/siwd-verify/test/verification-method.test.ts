import { encodeDidKey } from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import { selectVerificationMethod, type DidCkbDocument } from "../src/index.js";

describe("selectVerificationMethod", () => {
  const secpDidKey = encodeDidKey(
    "secp256k1",
    Uint8Array.from([0x02, ...new Array(32).fill(0x11)]),
  );
  const p256DidKey = encodeDidKey(
    "p256",
    Uint8Array.from([0x03, ...new Array(32).fill(0x22)]),
  );

  it("selects and decodes a P-256 verification method", () => {
    const result = selectVerificationMethod(document({ "auth-1": p256DidKey }), "auth-1");

    expect(result).toMatchObject({
      ok: true,
      keyId: "auth-1",
      didKey: p256DidKey,
      decoded: {
        curve: "p256",
      },
    });
  });

  it("selects and decodes a secp256k1 verification method", () => {
    const result = selectVerificationMethod(
      document({ wallet: secpDidKey }),
      "wallet",
    );

    expect(result).toMatchObject({
      ok: true,
      keyId: "wallet",
      didKey: secpDidKey,
      decoded: {
        curve: "secp256k1",
      },
    });
  });

  it("fails when the requested key ID is absent", () => {
    expect(selectVerificationMethod(document({ "auth-1": p256DidKey }), "missing")).toEqual({
      ok: false,
      code: "verification_method_missing",
      message: "DID document does not contain the requested verification method",
      keyId: "missing",
    });
  });

  it("fails when the did:key value is unsupported", () => {
    const result = selectVerificationMethod(
      document({ "auth-1": "did:key:z6MkiTBz1K9jDk4h6x3Va8r" }),
      "auth-1",
    );

    expect(result).toMatchObject({
      ok: false,
      code: "verification_method_invalid",
      keyId: "auth-1",
    });
  });
});

function document(verificationMethods: Record<string, string>): DidCkbDocument {
  return { verificationMethods };
}


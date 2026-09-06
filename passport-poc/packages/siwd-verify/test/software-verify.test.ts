import {
  base64UrlEncode,
  bytesFromUtf8,
  encodeDidKey,
  type DecodedDidKey,
} from "@ckb-passport/siwd-core";
import { p256 } from "@noble/curves/nist.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { describe, expect, it } from "vitest";
import {
  verifySoftwareSignature,
  type SoftwareSiwdProofEnvelope,
} from "../src/index.js";

const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);
const p256PrivateKey = Uint8Array.from(new Array(32).fill(7));
const secpPrivateKey = Uint8Array.from(new Array(32).fill(9));
const p256PublicKey = p256.getPublicKey(p256PrivateKey, true);
const secpPublicKey = secp256k1.getPublicKey(secpPrivateKey, true);
const message = "example.test wants you to sign in with your CKB DID:";

describe("verifySoftwareSignature", () => {
  it("passes a valid P-256 software proof", () => {
    expect(
      verifySoftwareSignature({
        proof: softwareProof(
          p256.sign(bytesFromUtf8(message), p256PrivateKey, {
            prehash: true,
            lowS: true,
            format: "compact",
          }),
        ),
        verificationMethod: selectedMethod(p256PublicKey, "p256"),
      }),
    ).toEqual({ ok: true });
  });

  it("passes a valid secp256k1 software proof", () => {
    expect(
      verifySoftwareSignature({
        proof: softwareProof(
          secp256k1.sign(bytesFromUtf8(message), secpPrivateKey, {
            prehash: true,
            lowS: true,
            format: "compact",
          }),
        ),
        verificationMethod: selectedMethod(secpPublicKey, "secp256k1"),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects WebAuthn fields on software proofs", () => {
    expect(
      verifySoftwareSignature({
        proof: {
          ...softwareProof(
            p256.sign(bytesFromUtf8(message), p256PrivateKey, {
              prehash: true,
              lowS: true,
              format: "compact",
            }),
          ),
          clientDataJSON: "AA",
        } as SoftwareSiwdProofEnvelope,
        verificationMethod: selectedMethod(p256PublicKey, "p256"),
      }),
    ).toMatchObject({
      ok: false,
      code: "webauthn_fields_forbidden",
    });
  });

  it("rejects invalid signatures", () => {
    expect(
      verifySoftwareSignature({
        proof: {
          ...softwareProof(
            p256.sign(bytesFromUtf8(message), p256PrivateKey, {
              prehash: true,
              lowS: true,
              format: "compact",
            }),
          ),
          message: `${message}tampered`,
        },
        verificationMethod: selectedMethod(p256PublicKey, "p256"),
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_verification_failed",
    });
  });

  it("rejects incoming high-S software signatures", () => {
    const highS = Uint8Array.from([
      ...scalarFromBigInt(1n),
      ...scalarFromBigInt(P256_ORDER - 1n),
    ]);

    expect(
      verifySoftwareSignature({
        proof: softwareProof(highS),
        verificationMethod: selectedMethod(p256PublicKey, "p256"),
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_high_s",
    });
  });

  it("rejects non-software proof mode", () => {
    expect(
      verifySoftwareSignature({
        proof: {
          ...softwareProof(new Uint8Array(64)),
          mode: "webauthn",
          clientDataJSON: "AA",
          authenticatorData: "AA",
        },
        verificationMethod: selectedMethod(p256PublicKey, "p256"),
      }),
    ).toMatchObject({
      ok: false,
      code: "proof_mode_invalid",
    });
  });
});

function softwareProof(signature: Uint8Array): SoftwareSiwdProofEnvelope {
  return {
    v: 1,
    did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    keyId: "auth-1",
    message,
    mode: "software",
    signature: base64UrlEncode(signature),
  };
}

function selectedMethod(
  compressedPublicKey: Uint8Array,
  curve: "secp256k1" | "p256",
) {
  const didKey = encodeDidKey(curve, compressedPublicKey);
  const decoded: DecodedDidKey = {
    didKey,
    curve,
    multicodecVarint:
      curve === "p256"
        ? Uint8Array.from([0x80, 0x24])
        : Uint8Array.from([0xe7, 0x01]),
    publicKeyCompressed: compressedPublicKey,
  };

  return {
    ok: true as const,
    keyId: "auth-1",
    didKey,
    decoded,
  };
}

function scalarFromBigInt(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

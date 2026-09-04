import { describe, expect, it } from "vitest";
import {
  assertLowSSignature,
  isLowSSignature,
  normalizeRawEcdsaSignature,
  SignaturePolicyError,
  type DidKeyCurve,
} from "../src/index.js";

const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);
const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);

describe("low-S ECDSA policy", () => {
  it("accepts low-S secp256k1 signatures", () => {
    const signature = fixtureSignature("secp256k1", 1n);

    expect(isLowSSignature("secp256k1", signature)).toBe(true);
    expect(assertLowSSignature("secp256k1", signature)).toBe(signature);
  });

  it("rejects high-S secp256k1 signatures", () => {
    const signature = fixtureSignature("secp256k1", SECP256K1_ORDER - 1n);

    expect(isLowSSignature("secp256k1", signature)).toBe(false);
    expect(() => assertLowSSignature("secp256k1", signature)).toThrow(
      SignaturePolicyError,
    );
  });

  it("accepts low-S P-256 signatures", () => {
    const signature = fixtureSignature("p256", 1n);

    expect(isLowSSignature("p256", signature)).toBe(true);
    expect(assertLowSSignature("p256", signature)).toBe(signature);
  });

  it("rejects high-S P-256 signatures", () => {
    const signature = fixtureSignature("p256", P256_ORDER - 1n);

    expect(isLowSSignature("p256", signature)).toBe(false);
    expect(() => assertLowSSignature("p256", signature)).toThrow(
      "High-S ECDSA signatures are not accepted",
    );
  });

  it("normalizes high-S signatures only for locally created proofs", () => {
    const highSignature = fixtureSignature("p256", P256_ORDER - 1n);
    const normalized = normalizeRawEcdsaSignature("p256", highSignature);

    expect(normalized).not.toBe(highSignature);
    expect(isLowSSignature("p256", normalized)).toBe(true);
    expect(highSignature.slice(0, 32)).toEqual(normalized.slice(0, 32));
  });

  it("rejects non-raw signatures before checking S", () => {
    expect(() => isLowSSignature("p256", new Uint8Array(65))).toThrow(
      "Expected a 64-byte raw ECDSA signature",
    );
  });
});

function fixtureSignature(curve: DidKeyCurve, s: bigint): Uint8Array {
  const signature = new Uint8Array(64);
  signature[31] = curve === "p256" ? 2 : 1;
  signature.set(scalarToBytes(s), 32);
  return signature;
}

function scalarToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}


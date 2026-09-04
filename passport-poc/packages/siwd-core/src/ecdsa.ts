import { assertRawEcdsaSignature } from "./bytes.js";
import type { DidKeyCurve } from "./did-key.js";

const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);
const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);
const SCALAR_LENGTH = 32;

export class SignaturePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignaturePolicyError";
  }
}

export function isLowSSignature(
  curve: DidKeyCurve,
  signature: Uint8Array,
): boolean {
  assertRawEcdsaSignature(signature);
  const s = scalarFromBytes(signature.slice(SCALAR_LENGTH));
  return s > 0n && s <= curveOrder(curve) / 2n;
}

export function assertLowSSignature(
  curve: DidKeyCurve,
  signature: Uint8Array,
): Uint8Array {
  if (!isLowSSignature(curve, signature)) {
    throw new SignaturePolicyError("High-S ECDSA signatures are not accepted");
  }
  return signature;
}

export function normalizeRawEcdsaSignature(
  curve: DidKeyCurve,
  signature: Uint8Array,
): Uint8Array {
  assertRawEcdsaSignature(signature);
  if (isLowSSignature(curve, signature)) {
    return new Uint8Array(signature);
  }

  const normalized = new Uint8Array(signature);
  const order = curveOrder(curve);
  const s = scalarFromBytes(signature.slice(SCALAR_LENGTH));
  const lowS = order - s;
  normalized.set(scalarToBytes(lowS), SCALAR_LENGTH);
  return normalized;
}

function curveOrder(curve: DidKeyCurve): bigint {
  return curve === "secp256k1" ? SECP256K1_ORDER : P256_ORDER;
}

function scalarFromBytes(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function scalarToBytes(value: bigint): Uint8Array {
  if (value <= 0n) {
    throw new SignaturePolicyError("ECDSA scalar must be positive");
  }

  const bytes = new Uint8Array(SCALAR_LENGTH);
  let remaining = value;
  for (let index = SCALAR_LENGTH - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new SignaturePolicyError("ECDSA scalar is too large");
  }
  return bytes;
}


import { sha256 } from "@noble/hashes/sha256";

export const RAW_ECDSA_SIGNATURE_LENGTH = 64;

export type BytesInput = string | Uint8Array;

export function bytesFromUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesFromInput(value: BytesInput): Uint8Array {
  return typeof value === "string" ? bytesFromUtf8(value) : new Uint8Array(value);
}

export function sha256Bytes(value: BytesInput): Uint8Array {
  return sha256(bytesFromInput(value));
}

export function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return diff === 0;
}

export function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error("Expected a 0x-prefixed even-length hex string");
  }

  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const unpadded = value.replace(/=+$/u, "");
  const paddingLength = value.length - unpadded.length;

  if (
    paddingLength > 2 ||
    unpadded.includes("=") ||
    !/^[A-Za-z0-9_-]*$/.test(unpadded)
  ) {
    throw new Error("Invalid base64url string");
  }

  if (unpadded.length % 4 === 1) {
    throw new Error("Invalid base64url string");
  }

  const base64 = `${unpadded.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat(
    (4 - (unpadded.length % 4)) % 4,
  )}`;
  return base64Decode(base64);
}

export function assertRawEcdsaSignature(signature: Uint8Array): Uint8Array {
  if (signature.length !== RAW_ECDSA_SIGNATURE_LENGTH) {
    throw new Error("Expected a 64-byte raw ECDSA signature");
  }
  return signature;
}

export function isRawEcdsaSignature(signature: Uint8Array): boolean {
  return signature.length === RAW_ECDSA_SIGNATURE_LENGTH;
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64Decode(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  return new Uint8Array(Buffer.from(value, "base64"));
}

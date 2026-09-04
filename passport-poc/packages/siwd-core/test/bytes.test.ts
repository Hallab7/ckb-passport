import { describe, expect, it } from "vitest";
import {
  assertRawEcdsaSignature,
  base64UrlDecode,
  base64UrlEncode,
  bytesFromUtf8,
  bytesToHex,
  constantTimeBytesEqual,
  hexToBytes,
  isRawEcdsaSignature,
  RAW_ECDSA_SIGNATURE_LENGTH,
  sha256Bytes,
} from "../src/index.js";

describe("byte utilities", () => {
  it("encodes and decodes base64url without padding", () => {
    const input = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = base64UrlEncode(input);

    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(base64UrlDecode(encoded)).toEqual(input);
    expect(base64UrlDecode(`${encoded}=`)).toEqual(input);
  });

  it("rejects invalid base64url input", () => {
    expect(() => base64UrlDecode("abc!")).toThrow("Invalid base64url string");
    expect(() => base64UrlDecode("a")).toThrow("Invalid base64url string");
    expect(() => base64UrlDecode("ab=c")).toThrow("Invalid base64url string");
  });

  it("computes SHA-256 bytes for strings and byte arrays", () => {
    const expected =
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    expect(bytesToHex(sha256Bytes("abc"))).toBe(expected);
    expect(bytesToHex(sha256Bytes(bytesFromUtf8("abc")))).toBe(expected);
  });

  it("compares bytes without early length success", () => {
    expect(
      constantTimeBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2])),
    ).toBe(true);
    expect(
      constantTimeBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3])),
    ).toBe(false);
    expect(
      constantTimeBytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 0])),
    ).toBe(false);
  });

  it("converts hex to bytes and back", () => {
    expect(hexToBytes("0x00aBff")).toEqual(Uint8Array.from([0, 171, 255]));
    expect(bytesToHex(Uint8Array.from([0, 171, 255]))).toBe("0x00abff");
    expect(() => hexToBytes("00ab")).toThrow("0x-prefixed");
    expect(() => hexToBytes("0xabc")).toThrow("even-length");
  });

  it("checks raw ECDSA signature length", () => {
    const rawSignature = new Uint8Array(RAW_ECDSA_SIGNATURE_LENGTH);

    expect(isRawEcdsaSignature(rawSignature)).toBe(true);
    expect(assertRawEcdsaSignature(rawSignature)).toBe(rawSignature);
    expect(isRawEcdsaSignature(new Uint8Array(65))).toBe(false);
    expect(() => assertRawEcdsaSignature(new Uint8Array(65))).toThrow(
      "Expected a 64-byte raw ECDSA signature",
    );
  });
});


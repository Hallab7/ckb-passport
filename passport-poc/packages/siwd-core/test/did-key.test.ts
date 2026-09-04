import { base58btc } from "multiformats/bases/base58";
import { describe, expect, it } from "vitest";
import {
  decodeDidKey,
  DidKeyCodecError,
  encodeDidKey,
  supportedDidKeyCurves,
} from "../src/index.js";

describe("did:key codec", () => {
  const secpPublicKey = Uint8Array.from([0x02, ...new Array(32).fill(0x11)]);
  const p256PublicKey = Uint8Array.from([0x03, ...new Array(32).fill(0x22)]);

  it("encodes and decodes secp256k1 keys with the zQ3s prefix", () => {
    const didKey = encodeDidKey("secp256k1", secpPublicKey);
    const decoded = decodeDidKey(didKey);

    expect(didKey.startsWith("did:key:zQ3s")).toBe(true);
    expect(decoded.curve).toBe("secp256k1");
    expect(decoded.multicodecVarint).toEqual(Uint8Array.from([0xe7, 0x01]));
    expect(decoded.publicKeyCompressed).toEqual(secpPublicKey);
  });

  it("encodes and decodes P-256 keys with the zDna prefix", () => {
    const didKey = encodeDidKey("p256", p256PublicKey);
    const decoded = decodeDidKey(didKey);

    expect(didKey.startsWith("did:key:zDna")).toBe(true);
    expect(decoded.curve).toBe("p256");
    expect(decoded.multicodecVarint).toEqual(Uint8Array.from([0x80, 0x24]));
    expect(decoded.publicKeyCompressed).toEqual(p256PublicKey);
  });

  it("reports the only supported curves", () => {
    expect(supportedDidKeyCurves()).toEqual(["secp256k1", "p256"]);
  });

  it("fails closed on unsupported multicodec values", () => {
    const ed25519Like = Uint8Array.from([0xed, 0x01, ...new Array(32).fill(0x33)]);
    const didKey = `did:key:${base58btc.encode(ed25519Like)}`;

    expect(() => decodeDidKey(didKey)).toThrow("Unsupported did:key multicodec");
  });

  it("fails closed on trailing bytes", () => {
    const withTrailingBytes = Uint8Array.from([
      0x80,
      0x24,
      ...p256PublicKey,
      0x00,
    ]);
    const didKey = `did:key:${base58btc.encode(withTrailingBytes)}`;

    expect(() => decodeDidKey(didKey)).toThrow(
      "did:key must contain exactly 33 public-key bytes",
    );
  });

  it("rejects malformed did:key strings", () => {
    expect(() => decodeDidKey("did:key:xnotbase58btc")).toThrow(
      "did:key must start with did:key:z",
    );
    expect(() => decodeDidKey("did:key:z0")).toThrow(DidKeyCodecError);
    expect(() => encodeDidKey("p256", new Uint8Array(32))).toThrow(
      "Compressed public key must be 33 bytes",
    );
    expect(() =>
      encodeDidKey("p256", Uint8Array.from([0x04, ...new Array(32).fill(0x22)])),
    ).toThrow("Compressed public key must start with 0x02 or 0x03");
  });
});


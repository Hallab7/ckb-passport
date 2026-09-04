import { encode } from "cborg";
import { describe, expect, it } from "vitest";
import {
  compressP256PublicKey,
  parseCoseP256PublicKey,
  passkeyAttestationToDidKey,
  PasskeyDidKeyError,
} from "../src/index.js";

describe("passkeyAttestationToDidKey", () => {
  const x = Uint8Array.from(new Array(32).fill(0x11));
  const yEven = Uint8Array.from(new Array(32).fill(0x22));
  const yOdd = Uint8Array.from([...new Array(31).fill(0x22), 0x23]);

  it("extracts a P-256 passkey public key and encodes did:key:zDna", () => {
    const result = passkeyAttestationToDidKey(attestationObject(x, yOdd));

    expect(result.didKey.startsWith("did:key:zDna")).toBe(true);
    expect(result.compressedPublicKey).toEqual(
      Uint8Array.from([0x03, ...Array.from(x)]),
    );
    expect(result.credentialPublicKey).toMatchObject({
      kty: 2,
      alg: -7,
      crv: 1,
      x,
      y: yOdd,
    });
  });

  it("compresses even and odd P-256 points", () => {
    expect(compressP256PublicKey(x, yEven)[0]).toBe(0x02);
    expect(compressP256PublicKey(x, yOdd)[0]).toBe(0x03);
  });

  it("rejects non-P-256 COSE keys", () => {
    expect(() => parseCoseP256PublicKey(coseKey({ 1: 1 }))).toThrow(
      "COSE key kty must be EC2",
    );
    expect(() => parseCoseP256PublicKey(coseKey({ 3: -8 }))).toThrow(
      "COSE key alg must be ES256",
    );
    expect(() => parseCoseP256PublicKey(coseKey({ "-1": 2 }))).toThrow(
      "COSE key crv must be P-256",
    );
  });

  it("rejects missing or malformed coordinates", () => {
    expect(() => parseCoseP256PublicKey(coseKey({ "-2": new Uint8Array(31) }))).toThrow(
      "COSE key x coordinate must be 32 bytes",
    );
    expect(() => parseCoseP256PublicKey(coseKey({ "-3": new Uint8Array(31) }))).toThrow(
      "COSE key y coordinate must be 32 bytes",
    );
    expect(() => compressP256PublicKey(new Uint8Array(31), yEven)).toThrow(
      "P-256 coordinates must both be 32 bytes",
    );
  });

  it("rejects malformed attestation CBOR and missing authData", () => {
    expect(() => passkeyAttestationToDidKey(Uint8Array.from([0xff]))).toThrow(
      PasskeyDidKeyError,
    );
    expect(() => passkeyAttestationToDidKey(encode(new Map()))).toThrow(
      "Attestation object authData must be bytes",
    );
  });

  it("rejects authenticator data without attested credential data", () => {
    const authData = new Uint8Array(37);
    expect(() =>
      passkeyAttestationToDidKey(encode(new Map([["authData", authData]]))),
    ).toThrow("Authenticator data does not contain attested credential data");
  });
});

function attestationObject(x: Uint8Array, y: Uint8Array): Uint8Array {
  return encode(new Map([["authData", authenticatorData(coseKey({ "-2": x, "-3": y }))]]));
}

function authenticatorData(credentialPublicKey: Uint8Array): Uint8Array {
  const rpIdHash = new Uint8Array(32);
  const flags = Uint8Array.from([0x41]);
  const signCount = new Uint8Array(4);
  const aaguid = new Uint8Array(16);
  const credentialId = Uint8Array.from([1, 2, 3]);
  const credentialIdLength = Uint8Array.from([0, credentialId.length]);
  return Uint8Array.from([
    ...rpIdHash,
    ...flags,
    ...signCount,
    ...aaguid,
    ...credentialIdLength,
    ...credentialId,
    ...credentialPublicKey,
  ]);
}

function coseKey(overrides: Record<string, unknown> = {}): Uint8Array {
  return encode(
    new Map([
      [1, overrides[1] ?? 2],
      [3, overrides[3] ?? -7],
      [-1, overrides["-1"] ?? 1],
      [-2, overrides["-2"] ?? Uint8Array.from(new Array(32).fill(0x11))],
      [-3, overrides["-3"] ?? Uint8Array.from(new Array(32).fill(0x22))],
    ]),
  );
}


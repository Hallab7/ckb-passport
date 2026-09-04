import { encodeDidKey } from "@ckb-passport/siwd-core";
import { decode } from "cborg";

export type PasskeyDidKeyResult = {
  didKey: string;
  compressedPublicKey: Uint8Array;
  credentialPublicKey: CoseP256PublicKey;
};

export type CoseP256PublicKey = {
  kty: 2;
  alg: -7;
  crv: 1;
  x: Uint8Array;
  y: Uint8Array;
};

export class PasskeyDidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyDidKeyError";
  }
}

export function passkeyAttestationToDidKey(
  attestationObject: Uint8Array,
): PasskeyDidKeyResult {
  const authData = extractAuthData(attestationObject);
  const coseBytes = extractCredentialPublicKeyBytes(authData);
  const coseKey = parseCoseP256PublicKey(coseBytes);
  const compressedPublicKey = compressP256PublicKey(coseKey.x, coseKey.y);

  return {
    didKey: encodeDidKey("p256", compressedPublicKey),
    compressedPublicKey,
    credentialPublicKey: coseKey,
  };
}

export function parseCoseP256PublicKey(coseBytes: Uint8Array): CoseP256PublicKey {
  let decoded: unknown;
  try {
    decoded = decode(coseBytes, { useMaps: true });
  } catch (error) {
    throw new PasskeyDidKeyError(
      error instanceof Error
        ? `Credential public key CBOR failed to decode: ${error.message}`
        : "Credential public key CBOR failed to decode",
    );
  }

  const kty = getCoseValue(decoded, 1);
  const alg = getCoseValue(decoded, 3);
  const crv = getCoseValue(decoded, -1);
  const x = getCoseValue(decoded, -2);
  const y = getCoseValue(decoded, -3);

  if (kty !== 2) {
    throw new PasskeyDidKeyError("COSE key kty must be EC2");
  }
  if (alg !== -7) {
    throw new PasskeyDidKeyError("COSE key alg must be ES256");
  }
  if (crv !== 1) {
    throw new PasskeyDidKeyError("COSE key crv must be P-256");
  }
  if (!(x instanceof Uint8Array) || x.length !== 32) {
    throw new PasskeyDidKeyError("COSE key x coordinate must be 32 bytes");
  }
  if (!(y instanceof Uint8Array) || y.length !== 32) {
    throw new PasskeyDidKeyError("COSE key y coordinate must be 32 bytes");
  }

  return { kty, alg, crv, x, y };
}

export function compressP256PublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  if (x.length !== 32 || y.length !== 32) {
    throw new PasskeyDidKeyError("P-256 coordinates must both be 32 bytes");
  }

  return Uint8Array.from([y[31] & 1 ? 0x03 : 0x02, ...x]);
}

function extractAuthData(attestationObject: Uint8Array): Uint8Array {
  let decoded: unknown;
  try {
    decoded = decode(attestationObject);
  } catch (error) {
    throw new PasskeyDidKeyError(
      error instanceof Error
        ? `Attestation object CBOR failed to decode: ${error.message}`
        : "Attestation object CBOR failed to decode",
    );
  }

  const authData = getMapLikeValue(decoded, "authData");
  if (!(authData instanceof Uint8Array)) {
    throw new PasskeyDidKeyError("Attestation object authData must be bytes");
  }
  return authData;
}

function extractCredentialPublicKeyBytes(authData: Uint8Array): Uint8Array {
  const rpIdHashLength = 32;
  const flagsLength = 1;
  const signCountLength = 4;
  const aaguidLength = 16;
  const credentialIdLengthBytes = 2;
  const flagsIndex = rpIdHashLength;
  const attestedCredentialDataFlag = 0x40;

  if (authData.length < rpIdHashLength + flagsLength + signCountLength) {
    throw new PasskeyDidKeyError("Authenticator data is too short");
  }
  if ((authData[flagsIndex] & attestedCredentialDataFlag) === 0) {
    throw new PasskeyDidKeyError(
      "Authenticator data does not contain attested credential data",
    );
  }

  const credentialIdLengthOffset =
    rpIdHashLength + flagsLength + signCountLength + aaguidLength;
  if (authData.length < credentialIdLengthOffset + credentialIdLengthBytes) {
    throw new PasskeyDidKeyError("Authenticator credential data is too short");
  }

  const credentialIdLength =
    (authData[credentialIdLengthOffset] << 8) |
    authData[credentialIdLengthOffset + 1];
  const credentialPublicKeyOffset =
    credentialIdLengthOffset + credentialIdLengthBytes + credentialIdLength;

  if (authData.length <= credentialPublicKeyOffset) {
    throw new PasskeyDidKeyError("Credential public key is missing");
  }

  return authData.slice(credentialPublicKeyOffset);
}

function getCoseValue(decoded: unknown, key: number): unknown {
  if (decoded instanceof Map) {
    return decoded.get(key);
  }
  if (typeof decoded === "object" && decoded !== null) {
    return (decoded as Record<string, unknown>)[String(key)];
  }
  return undefined;
}

function getMapLikeValue(decoded: unknown, key: string): unknown {
  if (decoded instanceof Map) {
    return decoded.get(key);
  }
  if (typeof decoded === "object" && decoded !== null) {
    return (decoded as Record<string, unknown>)[key];
  }
  return undefined;
}

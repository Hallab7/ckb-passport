import { base58btc } from "multiformats/bases/base58";

export type DidKeyCurve = "secp256k1" | "p256";

export type DecodedDidKey = {
  didKey: string;
  curve: DidKeyCurve;
  multicodecVarint: Uint8Array;
  publicKeyCompressed: Uint8Array;
};

const DID_KEY_PREFIX = "did:key:";
const COMPRESSED_PUBLIC_KEY_LENGTH = 33;
const SECP256K1_VARINT = Uint8Array.from([0xe7, 0x01]);
const P256_VARINT = Uint8Array.from([0x80, 0x24]);

export class DidKeyCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DidKeyCodecError";
  }
}

export function encodeDidKey(
  curve: DidKeyCurve,
  publicKeyCompressed: Uint8Array,
): string {
  assertCompressedPublicKey(publicKeyCompressed);
  const varint = curve === "secp256k1" ? SECP256K1_VARINT : P256_VARINT;
  const bytes = new Uint8Array(varint.length + publicKeyCompressed.length);
  bytes.set(varint, 0);
  bytes.set(publicKeyCompressed, varint.length);

  return `${DID_KEY_PREFIX}${base58btc.encode(bytes)}`;
}

export function decodeDidKey(didKey: string): DecodedDidKey {
  if (!didKey.startsWith(`${DID_KEY_PREFIX}z`)) {
    throw new DidKeyCodecError("did:key must start with did:key:z");
  }

  let bytes: Uint8Array;
  try {
    bytes = base58btc.decode(didKey.slice(DID_KEY_PREFIX.length));
  } catch {
    throw new DidKeyCodecError("did:key body is not valid base58btc");
  }

  const curve = readCurve(bytes);
  const varint = curve === "secp256k1" ? SECP256K1_VARINT : P256_VARINT;
  const publicKeyCompressed = bytes.slice(varint.length);

  if (publicKeyCompressed.length !== COMPRESSED_PUBLIC_KEY_LENGTH) {
    throw new DidKeyCodecError("did:key must contain exactly 33 public-key bytes");
  }
  assertCompressedPublicKey(publicKeyCompressed);

  return {
    didKey,
    curve,
    multicodecVarint: varint,
    publicKeyCompressed,
  };
}

export function supportedDidKeyCurves(): DidKeyCurve[] {
  return ["secp256k1", "p256"];
}

function readCurve(bytes: Uint8Array): DidKeyCurve {
  if (hasPrefix(bytes, SECP256K1_VARINT)) {
    return "secp256k1";
  }
  if (hasPrefix(bytes, P256_VARINT)) {
    return "p256";
  }

  throw new DidKeyCodecError("Unsupported did:key multicodec");
}

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function assertCompressedPublicKey(publicKeyCompressed: Uint8Array): void {
  if (publicKeyCompressed.length !== COMPRESSED_PUBLIC_KEY_LENGTH) {
    throw new DidKeyCodecError("Compressed public key must be 33 bytes");
  }
  if (publicKeyCompressed[0] !== 0x02 && publicKeyCompressed[0] !== 0x03) {
    throw new DidKeyCodecError("Compressed public key must start with 0x02 or 0x03");
  }
}


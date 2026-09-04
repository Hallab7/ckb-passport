import {
  base64UrlEncode,
  normalizeRawEcdsaSignature,
  sha256Bytes,
} from "@ckb-passport/siwd-core";

export type PasskeyAssertionOptions = {
  did: string;
  keyId: string;
  message: string;
  rpId: string;
  credentialId?: Uint8Array;
  userVerification?: UserVerificationRequirement;
};

export type WebAuthnProofEnvelope = {
  v: 1;
  did: string;
  keyId: string;
  message: string;
  mode: "webauthn";
  signature: string;
  clientDataJSON: string;
  authenticatorData: string;
  credentialId?: string;
};

export type BrowserAssertionCredentials = Pick<CredentialsContainer, "get">;

export class PasskeyAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyAssertionError";
  }
}

export function buildPasskeyRequestOptions(
  options: PasskeyAssertionOptions,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: toArrayBuffer(sha256Bytes(options.message)),
    rpId: options.rpId,
    userVerification: options.userVerification ?? "preferred",
    allowCredentials: options.credentialId
      ? [
          {
            type: "public-key",
            id: toArrayBuffer(options.credentialId),
          },
        ]
      : undefined,
  };
}

export async function signInWithPasskey(
  options: PasskeyAssertionOptions,
  credentials: BrowserAssertionCredentials | undefined =
    globalThis.navigator?.credentials,
): Promise<WebAuthnProofEnvelope> {
  if (!credentials) {
    throw new PasskeyAssertionError("WebAuthn credentials API is unavailable");
  }

  let credential: Credential | null;
  try {
    credential = await credentials.get({
      publicKey: buildPasskeyRequestOptions(options),
    });
  } catch (error) {
    throw new PasskeyAssertionError(
      error instanceof Error
        ? `Passkey assertion failed: ${error.message}`
        : "Passkey assertion failed",
    );
  }

  if (!credential) {
    throw new PasskeyAssertionError("Passkey assertion returned no credential");
  }
  if (!isAssertionCredential(credential)) {
    throw new PasskeyAssertionError(
      "Passkey assertion did not return authenticator assertion data",
    );
  }

  const rawSignature = derEcdsaSignatureToRaw(
    new Uint8Array(credential.response.signature),
  );
  const lowSSignature = normalizeRawEcdsaSignature("p256", rawSignature);

  return {
    v: 1,
    did: options.did,
    keyId: options.keyId,
    message: options.message,
    mode: "webauthn",
    signature: base64UrlEncode(lowSSignature),
    clientDataJSON: base64UrlEncode(
      new Uint8Array(credential.response.clientDataJSON),
    ),
    authenticatorData: base64UrlEncode(
      new Uint8Array(credential.response.authenticatorData),
    ),
    ...(credential.id ? { credentialId: credential.id } : {}),
  };
}

export function derEcdsaSignatureToRaw(signature: Uint8Array): Uint8Array {
  let offset = 0;
  if (readByte(signature, offset) !== 0x30) {
    throw new PasskeyAssertionError("ECDSA signature DER must start with a sequence");
  }
  offset += 1;

  const sequenceLength = readDerLength(signature, offset);
  offset = sequenceLength.nextOffset;
  if (offset + sequenceLength.length !== signature.length) {
    throw new PasskeyAssertionError("ECDSA signature DER sequence length is invalid");
  }

  const r = readDerInteger(signature, offset);
  offset = r.nextOffset;
  const s = readDerInteger(signature, offset);
  offset = s.nextOffset;
  if (offset !== signature.length) {
    throw new PasskeyAssertionError("ECDSA signature DER has trailing bytes");
  }

  const raw = new Uint8Array(64);
  raw.set(leftPadScalar(r.value), 0);
  raw.set(leftPadScalar(s.value), 32);
  return raw;
}

function readDerInteger(
  bytes: Uint8Array,
  offset: number,
): { value: Uint8Array; nextOffset: number } {
  if (readByte(bytes, offset) !== 0x02) {
    throw new PasskeyAssertionError("ECDSA signature DER integer is missing");
  }
  const length = readDerLength(bytes, offset + 1);
  const start = length.nextOffset;
  const end = start + length.length;
  if (end > bytes.length || length.length === 0) {
    throw new PasskeyAssertionError("ECDSA signature DER integer length is invalid");
  }

  return {
    value: bytes.slice(start, end),
    nextOffset: end,
  };
}

function readDerLength(
  bytes: Uint8Array,
  offset: number,
): { length: number; nextOffset: number } {
  const first = readByte(bytes, offset);
  if ((first & 0x80) === 0) {
    return {
      length: first,
      nextOffset: offset + 1,
    };
  }

  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 2) {
    throw new PasskeyAssertionError("ECDSA signature DER length is invalid");
  }
  if (offset + 1 + lengthBytes > bytes.length) {
    throw new PasskeyAssertionError("ECDSA signature DER length is truncated");
  }

  let length = 0;
  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }
  return {
    length,
    nextOffset: offset + 1 + lengthBytes,
  };
}

function leftPadScalar(scalar: Uint8Array): Uint8Array {
  let value = scalar;
  while (value.length > 0 && value[0] === 0x00) {
    value = value.slice(1);
  }
  if (value.length > 32) {
    throw new PasskeyAssertionError("ECDSA signature scalar is too large");
  }

  const padded = new Uint8Array(32);
  padded.set(value, 32 - value.length);
  return padded;
}

function readByte(bytes: Uint8Array, offset: number): number {
  if (offset >= bytes.length) {
    throw new PasskeyAssertionError("ECDSA signature DER is truncated");
  }
  return bytes[offset];
}

function isAssertionCredential(
  credential: Credential,
): credential is PublicKeyCredential & {
  response: AuthenticatorAssertionResponse;
} {
  const maybeCredential = credential as Partial<PublicKeyCredential> & {
    response?: Partial<AuthenticatorAssertionResponse>;
  };
  return (
    typeof maybeCredential.id === "string" &&
    maybeCredential.response?.signature instanceof ArrayBuffer &&
    maybeCredential.response.clientDataJSON instanceof ArrayBuffer &&
    maybeCredential.response.authenticatorData instanceof ArrayBuffer
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

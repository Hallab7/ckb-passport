import {
  base64UrlDecode,
  base64UrlEncode,
  sha256Bytes,
} from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import {
  buildPasskeyRequestOptions,
  derEcdsaSignatureToRaw,
  signInWithPasskey,
} from "../src/index.js";

const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);
const did = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const keyId = "auth-1";
const message = "example.test wants you to sign in with your CKB DID:";

describe("buildPasskeyRequestOptions", () => {
  it("uses SHA-256(message) as the WebAuthn challenge", () => {
    const options = buildPasskeyRequestOptions({
      did,
      keyId,
      message,
      rpId: "example.test",
      credentialId: Uint8Array.from([1, 2, 3]),
    });

    expect(new Uint8Array(options.challenge)).toEqual(sha256Bytes(message));
    expect(options.rpId).toBe("example.test");
    expect(options.userVerification).toBe("preferred");
    expect(options.allowCredentials).toHaveLength(1);
    expect(new Uint8Array(options.allowCredentials?.[0].id ?? new ArrayBuffer(0))).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });
});

describe("derEcdsaSignatureToRaw", () => {
  it("converts DER ECDSA into raw r||s", () => {
    const raw = Uint8Array.from([
      ...new Array(32).fill(0x01),
      ...new Array(32).fill(0x02),
    ]);

    expect(derEcdsaSignatureToRaw(derSignature(raw.slice(0, 32), raw.slice(32)))).toEqual(
      raw,
    );
  });

  it("trims DER positive-integer leading zeroes", () => {
    const r = Uint8Array.from([0, ...new Array(32).fill(0x81)]);
    const s = Uint8Array.from([0, ...new Array(32).fill(0x01)]);
    const raw = derEcdsaSignatureToRaw(derSignature(r, s));

    expect(raw.slice(0, 32)).toEqual(Uint8Array.from(new Array(32).fill(0x81)));
    expect(raw.slice(32)).toEqual(Uint8Array.from(new Array(32).fill(0x01)));
  });

  it("rejects malformed DER", () => {
    expect(() => derEcdsaSignatureToRaw(Uint8Array.from([0x31, 0]))).toThrow(
      "sequence",
    );
    expect(() =>
      derEcdsaSignatureToRaw(
        Uint8Array.from([0x30, 0x05, 0x02, 0x01, 0x01, 0x03, 0]),
      ),
    ).toThrow("integer");
  });
});

describe("signInWithPasskey", () => {
  it("returns a complete WebAuthn proof envelope with no address field", async () => {
    const rawSignature = Uint8Array.from([
      ...new Array(32).fill(0x01),
      ...scalarFromBigInt(2n),
    ]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({
        type: "webauthn.get",
        challenge: base64UrlEncode(sha256Bytes(message)),
        origin: "https://example.test",
      }),
    );
    const authenticatorData = Uint8Array.from(new Array(37).fill(7));

    let requestOptions: PublicKeyCredentialRequestOptions | undefined;
    const proof = await signInWithPasskey(
      {
        did,
        keyId,
        message,
        rpId: "example.test",
      },
      {
        get: async (options) => {
          requestOptions = options.publicKey;
          return fakeAssertionCredential({
            signature: derSignature(rawSignature.slice(0, 32), rawSignature.slice(32)),
            clientDataJSON,
            authenticatorData,
          });
        },
      },
    );

    expect(requestOptions).toBeDefined();
    expect(proof).toEqual({
      v: 1,
      did,
      keyId,
      message,
      mode: "webauthn",
      signature: base64UrlEncode(rawSignature),
      clientDataJSON: base64UrlEncode(clientDataJSON),
      authenticatorData: base64UrlEncode(authenticatorData),
      credentialId: "credential-1",
    });
    expect("address" in proof).toBe(false);
    expect("lockScript" in proof).toBe(false);
  });

  it("normalizes high-S signatures before returning the proof", async () => {
    const r = scalarFromBigInt(3n);
    const highS = scalarFromBigInt(P256_ORDER - 1n);
    const lowS = scalarFromBigInt(1n);

    const proof = await signInWithPasskey(
      {
        did,
        keyId,
        message,
        rpId: "example.test",
      },
      {
        get: async () =>
          fakeAssertionCredential({
            signature: derSignature(r, highS),
            clientDataJSON: Uint8Array.from([1]),
            authenticatorData: Uint8Array.from([2]),
          }),
      },
    );

    expect(base64UrlDecode(proof.signature)).toEqual(
      Uint8Array.from([...r, ...lowS]),
    );
  });
});

function fakeAssertionCredential(parts: {
  signature: Uint8Array;
  clientDataJSON: Uint8Array;
  authenticatorData: Uint8Array;
}): Credential {
  return {
    id: "credential-1",
    response: {
      signature: toArrayBuffer(parts.signature),
      clientDataJSON: toArrayBuffer(parts.clientDataJSON),
      authenticatorData: toArrayBuffer(parts.authenticatorData),
    },
  } as unknown as Credential;
}

function derSignature(r: Uint8Array, s: Uint8Array): Uint8Array {
  const body = Uint8Array.from([0x02, r.length, ...r, 0x02, s.length, ...s]);
  return Uint8Array.from([0x30, body.length, ...body]);
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

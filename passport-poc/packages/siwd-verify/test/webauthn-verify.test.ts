import {
  base64UrlEncode,
  encodeDidKey,
  sha256Bytes,
  type DecodedDidKey,
} from "@ckb-passport/siwd-core";
import { p256 } from "@noble/curves/nist.js";
import { describe, expect, it } from "vitest";
import {
  verifyWebAuthnSignature,
  type WebAuthnSiwdProofEnvelope,
} from "../src/index.js";

const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
);
const privateKey = Uint8Array.from(new Array(32).fill(7));
const publicKey = p256.getPublicKey(privateKey, true);
const message = "example.test wants you to sign in with your CKB DID:";
const expectedOrigin = "http://localhost:3000";
const rpId = "localhost";

describe("verifyWebAuthnSignature", () => {
  it("passes a valid WebAuthn proof", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof(),
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects clientDataJSON origin mismatch", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof({
          clientDataJSON: clientDataJSON({ origin: "http://evil.test" }),
        }),
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "client_data_origin_mismatch",
    });
  });

  it("rejects a challenge that does not equal SHA-256(message)", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof({
          clientDataJSON: clientDataJSON({ challenge: base64UrlEncode(sha256Bytes("other")) }),
        }),
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "challenge_mismatch",
    });
  });

  it("rejects authenticator data with User Present clear", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof({
          authenticatorData: authenticatorData({ userPresent: false }),
        }),
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "user_present_required",
    });
  });

  it("rejects a wrong rpId hash", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof({
          authenticatorData: authenticatorData({ rpId: "other.localhost" }),
        }),
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "rp_id_hash_mismatch",
    });
  });

  it("rejects a wrong verification method curve", () => {
    expect(
      verifyWebAuthnSignature({
        proof: webAuthnProof(),
        verificationMethod: selectedMethod(
          Uint8Array.from([0x02, ...new Array(32).fill(9)]),
          "secp256k1",
        ),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "curve_mismatch",
    });
  });

  it("fails when clientDataJSON is tampered after signing", () => {
    const proof = webAuthnProof();
    const tampered = {
      ...proof,
      clientDataJSON: base64UrlEncode(
        clientDataJSON({
          extra: "keeps semantics but changes bytes",
        }),
      ),
    };

    expect(
      verifyWebAuthnSignature({
        proof: tampered,
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_verification_failed",
    });
  });

  it("fails when authenticatorData is tampered after signing", () => {
    const proof = webAuthnProof();
    const tamperedAuthenticatorData = authenticatorData();
    tamperedAuthenticatorData[36] = 1;

    expect(
      verifyWebAuthnSignature({
        proof: {
          ...proof,
          authenticatorData: base64UrlEncode(tamperedAuthenticatorData),
        },
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_verification_failed",
    });
  });

  it("rejects incoming high-S WebAuthn signatures", () => {
    const proof = webAuthnProof();
    const highS = Uint8Array.from([
      ...scalarFromBigInt(1n),
      ...scalarFromBigInt(P256_ORDER - 1n),
    ]);

    expect(
      verifyWebAuthnSignature({
        proof: {
          ...proof,
          signature: base64UrlEncode(highS),
        },
        verificationMethod: selectedMethod(publicKey, "p256"),
        expectedOrigin,
        rpId,
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_high_s",
    });
  });
});

function webAuthnProof(
  overrides: {
    clientDataJSON?: Uint8Array;
    authenticatorData?: Uint8Array;
  } = {},
): WebAuthnSiwdProofEnvelope {
  const clientData = overrides.clientDataJSON ?? clientDataJSON();
  const authData = overrides.authenticatorData ?? authenticatorData();
  const signedBytes = concatBytes(authData, sha256Bytes(clientData));
  const signature = p256.sign(signedBytes, privateKey, {
    prehash: true,
    lowS: true,
    format: "compact",
  });

  return {
    v: 1,
    did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    keyId: "auth-1",
    message,
    mode: "webauthn",
    signature: base64UrlEncode(signature),
    clientDataJSON: base64UrlEncode(clientData),
    authenticatorData: base64UrlEncode(authData),
  };
}

function clientDataJSON(
  overrides: Partial<Record<string, string>> = {},
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      type: "webauthn.get",
      challenge: base64UrlEncode(sha256Bytes(message)),
      origin: expectedOrigin,
      ...overrides,
    }),
  );
}

function authenticatorData(
  options: { rpId?: string; userPresent?: boolean } = {},
): Uint8Array {
  const bytes = new Uint8Array(37);
  bytes.set(sha256Bytes(options.rpId ?? rpId), 0);
  bytes[32] = options.userPresent === false ? 0 : 0x01;
  return bytes;
}

function selectedMethod(
  compressedPublicKey: Uint8Array,
  curve: "secp256k1" | "p256",
) {
  const didKey = encodeDidKey(curve, compressedPublicKey);
  const decoded: DecodedDidKey = {
    didKey,
    curve,
    multicodecVarint:
      curve === "p256" ? Uint8Array.from([0x80, 0x24]) : Uint8Array.from([0xe7, 0x01]),
    publicKeyCompressed: compressedPublicKey,
  };

  return {
    ok: true as const,
    keyId: "auth-1",
    didKey,
    decoded,
  };
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

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

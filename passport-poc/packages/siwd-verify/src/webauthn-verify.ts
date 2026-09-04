import {
  assertLowSSignature,
  assertRawEcdsaSignature,
  base64UrlDecode,
  constantTimeBytesEqual,
  sha256Bytes,
} from "@ckb-passport/siwd-core";
import { p256 } from "@noble/curves/nist.js";
import type { SiwdProofEnvelope } from "./proof.js";
import type { VerificationMethodSelection } from "./verification-method.js";

export type VerifyWebAuthnSignatureOptions = {
  proof: SiwdProofEnvelope;
  verificationMethod: Extract<VerificationMethodSelection, { ok: true }>;
  expectedOrigin: string;
  rpId: string;
};

export type VerifyWebAuthnSignatureResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "proof_mode_invalid"
        | "curve_mismatch"
        | "signature_invalid"
        | "signature_high_s"
        | "client_data_invalid"
        | "client_data_type_invalid"
        | "client_data_origin_mismatch"
        | "challenge_mismatch"
        | "authenticator_data_invalid"
        | "rp_id_hash_mismatch"
        | "user_present_required"
        | "signature_verification_failed";
      message: string;
    };

const RP_ID_HASH_LENGTH = 32;
const FLAGS_INDEX = 32;
const USER_PRESENT_FLAG = 0x01;

export function verifyWebAuthnSignature(
  options: VerifyWebAuthnSignatureOptions,
): VerifyWebAuthnSignatureResult {
  if (options.proof.mode !== "webauthn") {
    return {
      ok: false,
      code: "proof_mode_invalid",
      message: "WebAuthn verification requires proof.mode to be webauthn",
    };
  }

  if (options.verificationMethod.decoded.curve !== "p256") {
    return {
      ok: false,
      code: "curve_mismatch",
      message: "WebAuthn verification requires a P-256 verification method",
    };
  }

  const decoded = decodeWebAuthnProofBytes(options.proof);
  if (!decoded.ok) {
    return decoded;
  }

  let signature: Uint8Array;
  try {
    signature = assertRawEcdsaSignature(decoded.signature);
  } catch (error) {
    return {
      ok: false,
      code: "signature_invalid",
      message:
        error instanceof Error ? error.message : "WebAuthn signature is invalid",
    };
  }

  try {
    assertLowSSignature("p256", signature);
  } catch (error) {
    return {
      ok: false,
      code: "signature_high_s",
      message:
        error instanceof Error ? error.message : "WebAuthn signature must be low-S",
    };
  }

  const clientData = parseClientDataJSON(decoded.clientDataJSON);
  if (!clientData.ok) {
    return clientData;
  }

  if (clientData.json.type !== "webauthn.get") {
    return {
      ok: false,
      code: "client_data_type_invalid",
      message: "clientDataJSON.type must be webauthn.get",
    };
  }

  if (clientData.json.origin !== options.expectedOrigin) {
    return {
      ok: false,
      code: "client_data_origin_mismatch",
      message: "clientDataJSON.origin must match the expected origin",
    };
  }

  const expectedChallenge = sha256Bytes(options.proof.message);
  let challenge: Uint8Array;
  try {
    challenge = base64UrlDecode(clientData.json.challenge);
  } catch (error) {
    return {
      ok: false,
      code: "challenge_mismatch",
      message:
        error instanceof Error ? error.message : "clientDataJSON.challenge is invalid",
    };
  }

  if (!constantTimeBytesEqual(challenge, expectedChallenge)) {
    return {
      ok: false,
      code: "challenge_mismatch",
      message: "clientDataJSON.challenge must equal SHA-256(message)",
    };
  }

  if (decoded.authenticatorData.length < RP_ID_HASH_LENGTH + 1) {
    return {
      ok: false,
      code: "authenticator_data_invalid",
      message: "authenticatorData is too short",
    };
  }

  const expectedRpIdHash = sha256Bytes(options.rpId);
  const actualRpIdHash = decoded.authenticatorData.slice(0, RP_ID_HASH_LENGTH);
  if (!constantTimeBytesEqual(actualRpIdHash, expectedRpIdHash)) {
    return {
      ok: false,
      code: "rp_id_hash_mismatch",
      message: "authenticatorData rpIdHash must match SHA-256(rpId)",
    };
  }

  if ((decoded.authenticatorData[FLAGS_INDEX] & USER_PRESENT_FLAG) === 0) {
    return {
      ok: false,
      code: "user_present_required",
      message: "authenticatorData must have the User Present bit set",
    };
  }

  const signedBytes = concatBytes(
    decoded.authenticatorData,
    sha256Bytes(decoded.clientDataJSON),
  );
  const verified = p256.verify(
    signature,
    signedBytes,
    options.verificationMethod.decoded.publicKeyCompressed,
    { prehash: true },
  );

  if (!verified) {
    return {
      ok: false,
      code: "signature_verification_failed",
      message: "WebAuthn signature did not verify against the DID verification method",
    };
  }

  return { ok: true };
}

function decodeWebAuthnProofBytes(proof: Extract<SiwdProofEnvelope, { mode: "webauthn" }>) {
  try {
    return {
      ok: true as const,
      signature: base64UrlDecode(proof.signature),
      clientDataJSON: base64UrlDecode(proof.clientDataJSON),
      authenticatorData: base64UrlDecode(proof.authenticatorData),
    };
  } catch (error) {
    return {
      ok: false as const,
      code: "client_data_invalid" as const,
      message:
        error instanceof Error ? error.message : "WebAuthn proof bytes are invalid",
    };
  }
}

function parseClientDataJSON(
  bytes: Uint8Array,
):
  | {
      ok: true;
      json: {
        type: string;
        origin: string;
        challenge: string;
      };
    }
  | {
      ok: false;
      code: "client_data_invalid";
      message: string;
    } {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(parsed)) {
      throw new Error("clientDataJSON must be an object");
    }
    if (
      typeof parsed.type !== "string" ||
      typeof parsed.origin !== "string" ||
      typeof parsed.challenge !== "string"
    ) {
      throw new Error("clientDataJSON type, origin, and challenge must be strings");
    }

    return {
      ok: true,
      json: {
        type: parsed.type,
        origin: parsed.origin,
        challenge: parsed.challenge,
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: "client_data_invalid",
      message:
        error instanceof Error ? error.message : "clientDataJSON is invalid",
    };
  }
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

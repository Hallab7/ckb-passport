import {
  assertLowSSignature,
  assertRawEcdsaSignature,
  base64UrlDecode,
  bytesFromUtf8,
} from "@ckb-passport/siwd-core";
import { p256 } from "@noble/curves/nist.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { SiwdProofEnvelope } from "./proof.js";
import type { VerificationMethodSelection } from "./verification-method.js";

export type VerifySoftwareSignatureOptions = {
  proof: SiwdProofEnvelope;
  verificationMethod: Extract<VerificationMethodSelection, { ok: true }>;
};

export type VerifySoftwareSignatureResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "proof_mode_invalid"
        | "webauthn_fields_forbidden"
        | "signature_invalid"
        | "signature_high_s"
        | "signature_verification_failed";
      message: string;
    };

export function verifySoftwareSignature(
  options: VerifySoftwareSignatureOptions,
): VerifySoftwareSignatureResult {
  if (options.proof.mode !== "software") {
    return {
      ok: false,
      code: "proof_mode_invalid",
      message: "software verification requires proof.mode to be software",
    };
  }

  if (
    "clientDataJSON" in options.proof ||
    "authenticatorData" in options.proof
  ) {
    return {
      ok: false,
      code: "webauthn_fields_forbidden",
      message: "software proofs must not include WebAuthn fields",
    };
  }

  let signature: Uint8Array;
  try {
    signature = assertRawEcdsaSignature(base64UrlDecode(options.proof.signature));
  } catch (error) {
    return {
      ok: false,
      code: "signature_invalid",
      message:
        error instanceof Error ? error.message : "software signature is invalid",
    };
  }

  const curve = options.verificationMethod.decoded.curve;
  try {
    assertLowSSignature(curve, signature);
  } catch (error) {
    return {
      ok: false,
      code: "signature_high_s",
      message:
        error instanceof Error ? error.message : "software signature must be low-S",
    };
  }

  const signedBytes = bytesFromUtf8(options.proof.message);
  const verified =
    curve === "p256"
      ? p256.verify(
          signature,
          signedBytes,
          options.verificationMethod.decoded.publicKeyCompressed,
          { prehash: true },
        )
      : secp256k1.verify(
          signature,
          signedBytes,
          options.verificationMethod.decoded.publicKeyCompressed,
          { prehash: true },
        );

  if (!verified) {
    return {
      ok: false,
      code: "signature_verification_failed",
      message:
        "software signature did not verify against the DID verification method",
    };
  }

  return { ok: true };
}

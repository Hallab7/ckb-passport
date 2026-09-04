import {
  assertLowSSignature,
  assertRawEcdsaSignature,
  base64UrlDecode,
  hexToBytes,
} from "@ckb-passport/siwd-core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { VerificationMethodSelection } from "./verification-method.js";
import type { SiwdProofEnvelope } from "./proof.js";
import { hashCkbPersonalMessage } from "./wallet-signing.js";

export type VerifyWalletSignatureOptions = {
  proof: SiwdProofEnvelope;
  verificationMethod: Extract<VerificationMethodSelection, { ok: true }>;
};

export type VerifyWalletSignatureResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "proof_mode_invalid"
        | "webauthn_fields_forbidden"
        | "curve_mismatch"
        | "signature_invalid"
        | "signature_high_s"
        | "signature_verification_failed";
      message: string;
    };

export function verifyWalletSignature(
  options: VerifyWalletSignatureOptions,
): VerifyWalletSignatureResult {
  if (options.proof.mode !== "wallet") {
    return {
      ok: false,
      code: "proof_mode_invalid",
      message: "wallet verification requires proof.mode to be wallet",
    };
  }

  if (
    "clientDataJSON" in options.proof ||
    "authenticatorData" in options.proof
  ) {
    return {
      ok: false,
      code: "webauthn_fields_forbidden",
      message: "wallet proofs must not include WebAuthn fields",
    };
  }

  if (options.verificationMethod.decoded.curve !== "secp256k1") {
    return {
      ok: false,
      code: "curve_mismatch",
      message: "wallet verification requires a secp256k1 verification method",
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
        error instanceof Error ? error.message : "wallet signature is invalid",
    };
  }

  try {
    assertLowSSignature("secp256k1", signature);
  } catch (error) {
    return {
      ok: false,
      code: "signature_high_s",
      message:
        error instanceof Error ? error.message : "wallet signature must be low-S",
    };
  }

  const signedPayload = hexToBytes(hashCkbPersonalMessage(options.proof.message));
  const verified = secp256k1.verify(
    signature,
    signedPayload,
    options.verificationMethod.decoded.publicKeyCompressed,
    { prehash: false },
  );

  if (!verified) {
    return {
      ok: false,
      code: "signature_verification_failed",
      message: "wallet signature did not verify against the DID verification method",
    };
  }

  return { ok: true };
}

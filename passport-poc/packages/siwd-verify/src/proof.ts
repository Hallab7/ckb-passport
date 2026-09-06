import {
  parseSiwdMessage,
  validateSiwdMessageFields,
  type ParsedSiwdMessageFields,
  type SiwdFieldValidationFailureCode,
  type SiwdNetwork,
} from "@ckb-passport/siwd-core";
import type { NonceConsumeResult } from "./nonce.js";

export type SiwdProofMode = "software" | "webauthn";

export type BaseSiwdProofEnvelope = {
  v: 1;
  did: string;
  keyId: string;
  message: string;
  mode: SiwdProofMode;
  signature: string;
};

export type SoftwareSiwdProofEnvelope = BaseSiwdProofEnvelope & {
  mode: "software";
};

export type WebAuthnSiwdProofEnvelope = BaseSiwdProofEnvelope & {
  mode: "webauthn";
  clientDataJSON: string;
  authenticatorData: string;
};

export type SiwdProofEnvelope = SoftwareSiwdProofEnvelope | WebAuthnSiwdProofEnvelope;

export type NonceConsumer = {
  consume(nonce: string): NonceConsumeResult;
};

export type VerifySiwdMessageChecksOptions = {
  proof: unknown;
  expectedOrigin: string;
  expectedNetwork: SiwdNetwork;
  nonceService: NonceConsumer;
  now?: Date;
};

export type VerifySiwdMessageChecksFailureCode =
  | "proof_invalid"
  | "message_parse_failed"
  | "proof_did_mismatch"
  | "proof_key_id_mismatch"
  | SiwdFieldValidationFailureCode
  | "nonce_unknown"
  | "nonce_expired"
  | "nonce_consumed";

export type VerifySiwdMessageChecksResult =
  | {
      ok: true;
      proof: SiwdProofEnvelope;
      fields: ParsedSiwdMessageFields;
    }
  | {
      ok: false;
      code: VerifySiwdMessageChecksFailureCode;
      message: string;
    };

export function verifySiwdMessageChecks(
  options: VerifySiwdMessageChecksOptions,
): VerifySiwdMessageChecksResult {
  const proof = parseProofEnvelope(options.proof);
  if (!proof.ok) {
    return proof;
  }

  let fields: ParsedSiwdMessageFields;
  try {
    fields = parseSiwdMessage(proof.proof.message);
  } catch (error) {
    return {
      ok: false,
      code: "message_parse_failed",
      message:
        error instanceof Error ? error.message : "SIWD message parse failed",
    };
  }

  if (proof.proof.did !== fields.did) {
    return {
      ok: false,
      code: "proof_did_mismatch",
      message: "proof DID must match the canonical message DID",
    };
  }

  if (proof.proof.keyId !== fields.keyId) {
    return {
      ok: false,
      code: "proof_key_id_mismatch",
      message: "proof keyId must match the canonical message keyId",
    };
  }

  const validation = validateSiwdMessageFields(fields, {
    expectedOrigin: options.expectedOrigin,
    expectedNetwork: options.expectedNetwork,
    now: options.now,
  });
  if (!validation.ok) {
    const first = validation.failures[0];
    return {
      ok: false,
      code: first.code,
      message: first.message,
    };
  }

  const nonce = options.nonceService.consume(fields.nonce);
  if (!nonce.ok) {
    return {
      ok: false,
      code: nonce.code,
      message: `nonce check failed: ${nonce.code}`,
    };
  }

  return {
    ok: true,
    proof: proof.proof,
    fields,
  };
}

function parseProofEnvelope(
  proof: unknown,
): { ok: true; proof: SiwdProofEnvelope } | Extract<VerifySiwdMessageChecksResult, { ok: false }> {
  if (!isRecord(proof)) {
    return {
      ok: false,
      code: "proof_invalid",
      message: "proof envelope must be an object",
    };
  }

  if (proof.v !== 1) {
    return {
      ok: false,
      code: "proof_invalid",
      message: "proof version must be 1",
    };
  }

  if (proof.mode !== "software" && proof.mode !== "webauthn") {
    return {
      ok: false,
      code: "proof_invalid",
      message: "proof mode must be software or webauthn",
    };
  }

  for (const field of ["did", "keyId", "message", "signature"]) {
    if (typeof proof[field] !== "string") {
      return {
        ok: false,
        code: "proof_invalid",
        message: `proof ${field} must be a string`,
      };
    }
  }

  if (proof.mode === "webauthn") {
    if (
      typeof proof.clientDataJSON !== "string" ||
      typeof proof.authenticatorData !== "string"
    ) {
      return {
        ok: false,
        code: "proof_invalid",
        message: "webauthn proof must include clientDataJSON and authenticatorData",
      };
    }
    return { ok: true, proof: proof as WebAuthnSiwdProofEnvelope };
  }

  return { ok: true, proof: proof as SoftwareSiwdProofEnvelope };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

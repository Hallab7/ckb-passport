import { ccc } from "@ckb-ccc/core";
import type { SiwdNetwork } from "@ckb-passport/siwd-core";
import {
  verifySiwdMessageChecks,
  type VerifySiwdMessageChecksFailureCode,
  type VerifySiwdMessageChecksOptions,
} from "./proof.js";
import {
  verifySiwdKeyChecks,
  type VerifySiwdKeyChecksResult,
} from "./key-checks.js";
import {
  verifySoftwareSignature,
  type VerifySoftwareSignatureResult,
} from "./software-verify.js";
import {
  verifyWebAuthnSignature,
  type VerifyWebAuthnSignatureResult,
} from "./webauthn-verify.js";

export type VerifySiwdProofOptions = Omit<
  VerifySiwdMessageChecksOptions,
  "expectedNetwork"
> & {
  client: ccc.Client;
  expectedNetwork: SiwdNetwork;
  rpId?: string;
};

export type VerifySiwdProofFailureCode =
  | VerifySiwdMessageChecksFailureCode
  | Extract<VerifySiwdKeyChecksResult, { ok: false }>["code"]
  | Extract<VerifySoftwareSignatureResult, { ok: false }>["code"]
  | Extract<VerifyWebAuthnSignatureResult, { ok: false }>["code"];

export type VerifySiwdProofResult =
  | {
      ok: true;
      did: string;
      keyId: string;
      mode: "software" | "webauthn";
    }
  | {
      ok: false;
      code: VerifySiwdProofFailureCode;
      message: string;
    };

export async function verifySiwdProof(
  options: VerifySiwdProofOptions,
): Promise<VerifySiwdProofResult> {
  const messageChecks = verifySiwdMessageChecks({
    proof: options.proof,
    expectedOrigin: options.expectedOrigin,
    expectedNetwork: options.expectedNetwork,
    nonceService: options.nonceService,
    now: options.now,
  });
  if (!messageChecks.ok) {
    return messageChecks;
  }

  let nonceCommitted = false;
  try {
    const keyChecks = await verifySiwdKeyChecks({
      client: options.client,
      did: messageChecks.fields.did,
      keyId: messageChecks.fields.keyId,
    });
    if (!keyChecks.ok) {
      return {
        ok: false,
        code: keyChecks.code,
        message: keyChecks.message,
      };
    }

    const signature =
      messageChecks.proof.mode === "software"
        ? verifySoftwareSignature({
            proof: messageChecks.proof,
            verificationMethod: keyChecks.verificationMethod,
          })
        : verifyWebAuthnSignature({
            proof: messageChecks.proof,
            verificationMethod: keyChecks.verificationMethod,
            expectedOrigin: options.expectedOrigin,
            rpId: options.rpId ?? new URL(options.expectedOrigin).hostname,
          });

    if (!signature.ok) {
      return signature;
    }

    const committed = options.nonceService.commit(messageChecks.fields.nonce);
    if (!committed.ok) {
      return {
        ok: false,
        code: committed.code,
        message: `nonce commit failed: ${committed.code}`,
      };
    }
    nonceCommitted = true;

    return {
      ok: true,
      did: messageChecks.fields.did,
      keyId: messageChecks.fields.keyId,
      mode: messageChecks.proof.mode,
    };
  } finally {
    if (!nonceCommitted) {
      options.nonceService.release(messageChecks.fields.nonce);
    }
  }
}

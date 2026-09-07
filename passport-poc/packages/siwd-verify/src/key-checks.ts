import { ccc } from "@ckb-ccc/core";
import { decodeDidDocumentFromCell, type DidCkbDocument } from "./document.js";
import { resolveDidCell } from "./resolver.js";
import {
  selectVerificationMethod,
  type VerificationMethodSelection,
} from "./verification-method.js";

export type VerifySiwdKeyChecksOptions = {
  client: ccc.Client;
  did: string;
  keyId: string;
};

export type VerifySiwdKeyChecksResult =
  | {
      ok: true;
      did: string;
      keyId: string;
      document: DidCkbDocument;
      verificationMethod: Extract<VerificationMethodSelection, { ok: true }>;
    }
  | {
      ok: false;
      code:
        | "did_invalid"
        | "did_not_found_or_deactivated"
        | "did_ambiguous"
        | "did_document_decode_failed"
        | "verification_method_missing"
        | "verification_method_invalid";
      message: string;
      did: string;
      keyId: string;
    };

export async function verifySiwdKeyChecks(
  options: VerifySiwdKeyChecksOptions,
): Promise<VerifySiwdKeyChecksResult> {
  const resolution = await resolveDidCell({
    client: options.client,
    did: options.did,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      code: resolution.code,
      message: resolution.message,
      did: options.did,
      keyId: options.keyId,
    };
  }

  const decoded = decodeDidDocumentFromCell(resolution.cell);
  if (!decoded.ok) {
    return {
      ok: false,
      code: "did_document_decode_failed",
      message: decoded.message,
      did: options.did,
      keyId: options.keyId,
    };
  }

  const selected = selectVerificationMethod(decoded.document, options.keyId);
  if (!selected.ok) {
    return {
      ok: false,
      code: selected.code,
      message: selected.message,
      did: options.did,
      keyId: options.keyId,
    };
  }

  return {
    ok: true,
    did: options.did,
    keyId: options.keyId,
    document: decoded.document,
    verificationMethod: selected,
  };
}

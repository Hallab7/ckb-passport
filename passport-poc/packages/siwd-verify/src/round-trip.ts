import { ccc } from "@ckb-ccc/core";
import { decodeDidDocumentFromCell } from "./document.js";
import { resolveDidCell } from "./resolver.js";

export type DidVerificationMethodRoundTrip =
  | {
      ok: true;
      did: string;
      keyId: string;
      expectedDidKey: string;
      foundDidKey: string;
    }
  | {
      ok: false;
      code:
        | "did_cell_resolve_failed"
        | "did_document_decode_failed"
        | "verification_method_missing"
        | "did_key_mismatch";
      message: string;
      did: string;
      keyId: string;
      expectedDidKey: string;
      foundDidKey?: string;
    };

export type CheckDidVerificationMethodRoundTripOptions = {
  client: ccc.Client;
  did: string;
  expectedDidKey: string;
  keyId?: string;
};

const DEFAULT_KEY_ID = "auth-1";

export async function checkDidVerificationMethodRoundTrip(
  options: CheckDidVerificationMethodRoundTripOptions,
): Promise<DidVerificationMethodRoundTrip> {
  const keyId = options.keyId ?? DEFAULT_KEY_ID;
  const resolution = await resolveDidCell({
    client: options.client,
    did: options.did,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      code: "did_cell_resolve_failed",
      message: resolution.message,
      did: options.did,
      keyId,
      expectedDidKey: options.expectedDidKey,
    };
  }

  const decoded = decodeDidDocumentFromCell(resolution.cell);
  if (!decoded.ok) {
    return {
      ok: false,
      code: "did_document_decode_failed",
      message: decoded.message,
      did: options.did,
      keyId,
      expectedDidKey: options.expectedDidKey,
    };
  }

  const foundDidKey = decoded.document.verificationMethods[keyId];
  if (!foundDidKey) {
    return {
      ok: false,
      code: "verification_method_missing",
      message: "DID document does not contain the expected verification method",
      did: options.did,
      keyId,
      expectedDidKey: options.expectedDidKey,
    };
  }

  if (foundDidKey !== options.expectedDidKey) {
    return {
      ok: false,
      code: "did_key_mismatch",
      message: "DID document verification method does not match expected did:key",
      did: options.did,
      keyId,
      expectedDidKey: options.expectedDidKey,
      foundDidKey,
    };
  }

  return {
    ok: true,
    did: options.did,
    keyId,
    expectedDidKey: options.expectedDidKey,
    foundDidKey,
  };
}

import { decodeDidKey, type DecodedDidKey } from "@ckb-passport/siwd-core";
import type { DidCkbDocument } from "./document.js";

export type VerificationMethodSelection =
  | {
      ok: true;
      keyId: string;
      didKey: string;
      decoded: DecodedDidKey;
    }
  | {
      ok: false;
      code: "verification_method_missing" | "verification_method_invalid";
      message: string;
      keyId: string;
    };

export function selectVerificationMethod(
  document: DidCkbDocument,
  keyId: string,
): VerificationMethodSelection {
  const didKey = document.verificationMethods[keyId];
  if (!didKey) {
    return {
      ok: false,
      code: "verification_method_missing",
      message: "DID document does not contain the requested verification method",
      keyId,
    };
  }

  try {
    return {
      ok: true,
      keyId,
      didKey,
      decoded: decodeDidKey(didKey),
    };
  } catch (error) {
    return {
      ok: false,
      code: "verification_method_invalid",
      message:
        error instanceof Error
          ? `Verification method did:key is invalid: ${error.message}`
          : "Verification method did:key is invalid",
      keyId,
    };
  }
}


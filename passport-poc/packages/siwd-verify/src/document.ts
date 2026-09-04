import { ccc } from "@ckb-ccc/core";
import { DidCkbData } from "@ckb-ccc/did-ckb";

export type DidCkbDocument = {
  verificationMethods: Record<string, string>;
  alsoKnownAs?: string[];
  services?: Record<string, unknown>;
};

export type DidDocumentDecodeResult =
  | {
      ok: true;
      document: DidCkbDocument;
      data: DidCkbData;
    }
  | {
      ok: false;
      code:
        | "did_cell_data_missing"
        | "did_cell_data_decode_failed"
        | "did_document_forbidden_field"
        | "did_document_invalid";
      message: string;
    };

const FORBIDDEN_DOCUMENT_FIELDS = ["type", "rotationKeys", "prev", "sig"];

export function decodeDidDocumentFromCell(
  cell: ccc.Cell,
): DidDocumentDecodeResult {
  const outputData = (cell as { outputData?: unknown }).outputData;
  if (typeof outputData !== "string" && !(outputData instanceof Uint8Array)) {
    return {
      ok: false,
      code: "did_cell_data_missing",
      message: "DID cell outputData is missing",
    };
  }

  let data: DidCkbData;
  try {
    data = DidCkbData.decode(outputData);
  } catch (error) {
    return {
      ok: false,
      code: "did_cell_data_decode_failed",
      message:
        error instanceof Error
          ? `DID cell data failed to decode: ${error.message}`
          : "DID cell data failed to decode",
    };
  }

  return validateDidCkbDocument(data.value.document, data);
}

export function validateDidCkbDocument(
  document: unknown,
  data?: DidCkbData,
): DidDocumentDecodeResult {
  if (!isRecord(document)) {
    return {
      ok: false,
      code: "did_document_invalid",
      message: "DID document must be an object",
    };
  }

  for (const field of FORBIDDEN_DOCUMENT_FIELDS) {
    if (field in document) {
      return {
        ok: false,
        code: "did_document_forbidden_field",
        message: `DID document must not contain ${field}`,
      };
    }
  }

  const verificationMethods =
    document.verificationMethods === undefined
      ? {}
      : document.verificationMethods;

  if (!isRecord(verificationMethods)) {
    return {
      ok: false,
      code: "did_document_invalid",
      message: "DID document verificationMethods must be an object",
    };
  }

  for (const [key, value] of Object.entries(verificationMethods)) {
    if (key.length === 0 || typeof value !== "string") {
      return {
        ok: false,
        code: "did_document_invalid",
        message: "DID document verificationMethods values must be strings",
      };
    }
  }

  if (
    "alsoKnownAs" in document &&
    !(
      Array.isArray(document.alsoKnownAs) &&
      document.alsoKnownAs.every((value) => typeof value === "string")
    )
  ) {
    return {
      ok: false,
      code: "did_document_invalid",
      message: "DID document alsoKnownAs must be an array of strings",
    };
  }

  if ("services" in document && !isRecord(document.services)) {
    return {
      ok: false,
      code: "did_document_invalid",
      message: "DID document services must be an object",
    };
  }

  const alsoKnownAs = document.alsoKnownAs as string[] | undefined;
  const services = document.services as Record<string, unknown> | undefined;
  const normalizedDocument = {
    verificationMethods: verificationMethods as Record<string, string>,
    ...(alsoKnownAs ? { alsoKnownAs } : {}),
    ...(services ? { services } : {}),
  };

  return {
    ok: true,
    document: normalizedDocument,
    data: data ?? DidCkbData.fromV1({ document: normalizedDocument }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { ParsedSiwdMessageFields, SiwdNetwork } from "./message.js";

export const DEFAULT_MAX_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_ALLOWED_FUTURE_SKEW_MS = 60 * 1000;

export type SiwdFieldValidationFailureCode =
  | "domain_invalid"
  | "domain_mismatch"
  | "did_invalid"
  | "statement_invalid"
  | "uri_invalid"
  | "uri_origin_mismatch"
  | "version_invalid"
  | "network_invalid"
  | "network_mismatch"
  | "nonce_invalid"
  | "timestamp_invalid"
  | "expiration_not_after_issued"
  | "expiration_too_far"
  | "message_expired"
  | "issued_at_too_far_future";

export type SiwdFieldValidationFailure = {
  code: SiwdFieldValidationFailureCode;
  message: string;
};

export type SiwdFieldValidationOptions = {
  expectedOrigin: string;
  expectedNetwork?: SiwdNetwork;
  now?: Date;
  maxTtlMs?: number;
  allowedFutureSkewMs?: number;
};

export type SiwdFieldValidationResult =
  | { ok: true; fields: ParsedSiwdMessageFields }
  | { ok: false; failures: SiwdFieldValidationFailure[] };

const DID_CKB_PATTERN = /^did:ckb:[a-z2-7]{32}$/;
const NONCE_PATTERN = /^[a-zA-Z0-9]{8,}$/;
const RFC3339_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function validateSiwdMessageFields(
  fields: ParsedSiwdMessageFields,
  options: SiwdFieldValidationOptions,
): SiwdFieldValidationResult {
  const failures: SiwdFieldValidationFailure[] = [];
  const expectedOrigin = parseOrigin(options.expectedOrigin);
  const messageAuthority = parseAuthority(fields.domain);
  const messageUri = parseAbsoluteUrl(fields.uri);
  const issuedAt = parseUtcTimestamp(fields.issuedAt);
  const expirationTime = parseUtcTimestamp(fields.expirationTime);
  const now = options.now ?? new Date();
  const maxTtlMs = options.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
  const allowedFutureSkewMs =
    options.allowedFutureSkewMs ?? DEFAULT_ALLOWED_FUTURE_SKEW_MS;

  if (!messageAuthority) {
    failures.push({
      code: "domain_invalid",
      message: "domain must be an RFC 3986 authority",
    });
  } else if (expectedOrigin && messageAuthority !== expectedOrigin.host) {
    failures.push({
      code: "domain_mismatch",
      message: "domain must match expected origin host",
    });
  }

  if (!DID_CKB_PATTERN.test(fields.did)) {
    failures.push({
      code: "did_invalid",
      message: "did must match did:ckb:[a-z2-7]{32}",
    });
  }

  if (fields.statement.includes("\n") || fields.statement.startsWith("-")) {
    failures.push({
      code: "statement_invalid",
      message: "statement must be one line and must not start with '-'",
    });
  }

  if (!messageUri) {
    failures.push({
      code: "uri_invalid",
      message: "uri must be absolute",
    });
  } else if (expectedOrigin && messageUri.origin !== expectedOrigin.origin) {
    failures.push({
      code: "uri_origin_mismatch",
      message: "uri origin must match expected origin",
    });
  }

  if (fields.version !== "1") {
    failures.push({
      code: "version_invalid",
      message: "version must be literal 1",
    });
  }

  if (fields.network !== "ckb-testnet" && fields.network !== "ckb-mainnet") {
    failures.push({
      code: "network_invalid",
      message: "network must be ckb-testnet or ckb-mainnet",
    });
  } else if (
    options.expectedNetwork &&
    fields.network !== options.expectedNetwork
  ) {
    failures.push({
      code: "network_mismatch",
      message: "network must match expected network",
    });
  }

  if (!NONCE_PATTERN.test(fields.nonce)) {
    failures.push({
      code: "nonce_invalid",
      message: "nonce must be at least 8 alphanumeric characters",
    });
  }

  if (!issuedAt) {
    failures.push({
      code: "timestamp_invalid",
      message: "issuedAt must be an RFC 3339 UTC timestamp ending in Z",
    });
  }

  if (!expirationTime) {
    failures.push({
      code: "timestamp_invalid",
      message: "expirationTime must be an RFC 3339 UTC timestamp ending in Z",
    });
  }

  if (issuedAt && expirationTime) {
    const ttlMs = expirationTime.getTime() - issuedAt.getTime();
    if (ttlMs <= 0) {
      failures.push({
        code: "expiration_not_after_issued",
        message: "expirationTime must be after issuedAt",
      });
    } else if (ttlMs > maxTtlMs) {
      failures.push({
        code: "expiration_too_far",
        message: "expirationTime must be within the maximum TTL",
      });
    }

    if (now.getTime() >= expirationTime.getTime()) {
      failures.push({
        code: "message_expired",
        message: "message is expired",
      });
    }

    if (issuedAt.getTime() > now.getTime() + allowedFutureSkewMs) {
      failures.push({
        code: "issued_at_too_far_future",
        message: "issuedAt is too far in the future",
      });
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  return { ok: true, fields };
}

function parseOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function parseAuthority(value: string): string | undefined {
  try {
    const url = new URL(`siwd://${value}`);
    if (
      url.username ||
      url.password ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.host;
  } catch {
    return undefined;
  }
}

function parseAbsoluteUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function parseUtcTimestamp(value: string): Date | undefined {
  if (!RFC3339_UTC_PATTERN.test(value)) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const normalizedInput = value.replace(/\.0+Z$/, "Z");
  const normalizedIso = date.toISOString().replace(/\.000Z$/, "Z");
  if (normalizedIso !== normalizedInput) {
    return undefined;
  }

  return date;
}

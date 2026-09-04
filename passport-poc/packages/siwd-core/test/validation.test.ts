import { describe, expect, it } from "vitest";
import {
  buildSiwdMessage,
  parseSiwdMessage,
  validateSiwdMessageFields,
  type ParsedSiwdMessageFields,
} from "../src/index.js";

const now = new Date("2026-09-04T08:00:00.000Z");

function validFields(overrides: Partial<ParsedSiwdMessageFields> = {}) {
  return parseSiwdMessage(
    buildSiwdMessage({
      domain: "localhost:3000",
      did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      statement: "Sign in to Passport.",
      keyId: "auth-1",
      uri: "http://localhost:3000/login",
      version: "1",
      network: "ckb-testnet",
      nonce: "abc123DEF456",
      issuedAt: "2026-09-04T08:00:00Z",
      expirationTime: "2026-09-04T08:05:00Z",
      ...overrides,
    }),
  );
}

function codes(fields: ParsedSiwdMessageFields) {
  const result = validateSiwdMessageFields(fields, {
    expectedOrigin: "http://localhost:3000",
    expectedNetwork: "ckb-testnet",
    now,
  });
  return result.ok ? [] : result.failures.map((failure) => failure.code);
}

describe("validateSiwdMessageFields", () => {
  it("accepts valid canonical fields", () => {
    expect(
      validateSiwdMessageFields(validFields(), {
        expectedOrigin: "http://localhost:3000",
        expectedNetwork: "ckb-testnet",
        now,
      }),
    ).toEqual({ ok: true, fields: validFields() });
  });

  it("validates domain authority against expected origin host", () => {
    expect(codes(validFields({ domain: "example.com" }))).toContain(
      "domain_mismatch",
    );
    expect(codes(validFields({ domain: "localhost:3000/path" }))).toContain(
      "domain_invalid",
    );
  });

  it("validates did syntax", () => {
    expect(codes(validFields({ did: "did:ckb:ABC" }))).toContain("did_invalid");
  });

  it("validates statement shape", () => {
    expect(codes({ ...validFields(), statement: "- bad" })).toContain(
      "statement_invalid",
    );
  });

  it("validates URI absoluteness and origin", () => {
    expect(codes(validFields({ uri: "/login" }))).toContain("uri_invalid");
    expect(codes(validFields({ uri: "https://localhost:3000/login" }))).toContain(
      "uri_origin_mismatch",
    );
  });

  it("validates version and network", () => {
    expect(codes(validFields({ version: "2" }))).toContain("version_invalid");
    expect(codes(validFields({ network: "bad" }))).toContain("network_invalid");
    expect(codes(validFields({ network: "ckb-mainnet" }))).toContain(
      "network_mismatch",
    );
  });

  it("validates nonce shape", () => {
    expect(codes(validFields({ nonce: "short7" }))).toContain("nonce_invalid");
    expect(codes(validFields({ nonce: "abc12345!" }))).toContain(
      "nonce_invalid",
    );
  });

  it("validates timestamp format", () => {
    expect(codes(validFields({ issuedAt: "2026-09-04T08:00:00+00:00" }))).toContain(
      "timestamp_invalid",
    );
    expect(codes(validFields({ expirationTime: "not-a-date" }))).toContain(
      "timestamp_invalid",
    );
  });

  it("validates expiration order and TTL", () => {
    expect(
      codes(validFields({ expirationTime: "2026-09-04T07:59:59Z" })),
    ).toContain("expiration_not_after_issued");
    expect(
      codes(validFields({ expirationTime: "2026-09-04T08:05:01Z" })),
    ).toContain("expiration_too_far");
  });

  it("validates current time bounds", () => {
    expect(
      codes(
        validFields({
          issuedAt: "2026-09-04T07:50:00Z",
          expirationTime: "2026-09-04T07:55:00Z",
        }),
      ),
    ).toContain("message_expired");
    expect(codes(validFields({ issuedAt: "2026-09-04T08:01:01Z" }))).toContain(
      "issued_at_too_far_future",
    );
  });
});

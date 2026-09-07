import { buildSiwdMessage, type SiwdMessageFields } from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import {
  InMemoryNonceService,
  verifySiwdMessageChecks,
  type SoftwareSiwdProofEnvelope,
} from "../src/index.js";

const now = new Date("2026-09-04T08:00:00Z");
const expectedOrigin = "http://localhost:3000";
const baseFields: SiwdMessageFields = {
  domain: "localhost:3000",
  did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  statement: "Sign in to Passport PoC",
  keyId: "auth-1",
  uri: "http://localhost:3000/login",
  version: "1",
  network: "ckb-testnet",
  nonce: "abc123DEF456",
  issuedAt: "2026-09-04T07:59:00Z",
  expirationTime: "2026-09-04T08:01:00Z",
};

describe("verifySiwdMessageChecks", () => {
  it("accepts message checks and reserves the nonce", () => {
    const nonceService = nonceStore(baseFields.nonce);
    const result = verifySiwdMessageChecks({
      proof: proofFor(baseFields),
      expectedOrigin,
      expectedNetwork: "ckb-testnet",
      nonceService,
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      fields: {
        did: baseFields.did,
        keyId: baseFields.keyId,
      },
    });
    expect(nonceService.reserve(baseFields.nonce)).toEqual({
      ok: false,
      code: "nonce_reserved",
    });
    expect(nonceService.release(baseFields.nonce)).toBe(true);
  });

  it("rejects a wrong domain", () => {
    expect(runWith({ domain: "evil.test" })).toMatchObject({
      ok: false,
      code: "domain_mismatch",
    });
  });

  it("rejects a wrong URI origin", () => {
    expect(runWith({ uri: "http://evil.test/login" })).toMatchObject({
      ok: false,
      code: "uri_origin_mismatch",
    });
  });

  it("rejects an expired message", () => {
    expect(
      runWith({
        issuedAt: "2026-09-04T07:50:00Z",
        expirationTime: "2026-09-04T07:55:00Z",
      }),
    ).toMatchObject({
      ok: false,
      code: "message_expired",
    });
  });

  it("rejects issuedAt too far in the future", () => {
    expect(
      runWith({
        issuedAt: "2026-09-04T08:02:01Z",
        expirationTime: "2026-09-04T08:04:00Z",
      }),
    ).toMatchObject({
      ok: false,
      code: "issued_at_too_far_future",
    });
  });

  it("rejects replayed nonces", () => {
    const nonceService = nonceStore(baseFields.nonce);
    const first = verifySiwdMessageChecks({
        proof: proofFor(baseFields),
        expectedOrigin,
        expectedNetwork: "ckb-testnet",
        nonceService,
        now,
      });
    expect(first).toMatchObject({ ok: true });
    expect(nonceService.commit(baseFields.nonce).ok).toBe(true);

    expect(
      verifySiwdMessageChecks({
        proof: proofFor(baseFields),
        expectedOrigin,
        expectedNetwork: "ckb-testnet",
        nonceService,
        now,
      }),
    ).toMatchObject({
      ok: false,
      code: "nonce_consumed",
    });
  });

  it("rejects the wrong network", () => {
    expect(runWith({ network: "ckb-mainnet" })).toMatchObject({
      ok: false,
      code: "network_mismatch",
    });
  });

  it("rejects a bad version", () => {
    expect(runWith({ version: "2" as "1" })).toMatchObject({
      ok: false,
      code: "version_invalid",
    });
  });

  it("rejects invalid DID syntax", () => {
    expect(runWith({ did: "did:ckb:not-valid" })).toMatchObject({
      ok: false,
      code: "did_invalid",
    });
  });

  it("rejects proof DID and key ID mismatches before nonce use", () => {
    const nonceService = nonceStore(baseFields.nonce);
    const result = verifySiwdMessageChecks({
      proof: {
        ...proofFor(baseFields),
        keyId: "other",
      },
      expectedOrigin,
      expectedNetwork: "ckb-testnet",
      nonceService,
      now,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "proof_key_id_mismatch",
    });
    expect(nonceService.get(baseFields.nonce)?.consumed).toBe(false);
  });
});

function runWith(
  overrides: Partial<Record<keyof SiwdMessageFields, string>>,
): ReturnType<typeof verifySiwdMessageChecks> {
  const fields = { ...baseFields, ...overrides } as SiwdMessageFields;
  return verifySiwdMessageChecks({
    proof: proofFor(fields),
    expectedOrigin,
    expectedNetwork: "ckb-testnet",
    nonceService: nonceStore(fields.nonce),
    now,
  });
}

function proofFor(fields: SiwdMessageFields): SoftwareSiwdProofEnvelope {
  return {
    v: 1,
    did: fields.did,
    keyId: fields.keyId,
    message: buildSiwdMessage(fields),
    mode: "software",
    signature: "AA",
  };
}

function nonceStore(nonce: string): InMemoryNonceService {
  const service = new InMemoryNonceService({ now: () => now });
  service.issue(nonce);
  return service;
}

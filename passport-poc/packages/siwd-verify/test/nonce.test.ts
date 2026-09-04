import { describe, expect, it } from "vitest";
import { generateNonce, InMemoryNonceService } from "../src/index.js";

describe("InMemoryNonceService", () => {
  it("issues alphanumeric nonces with an expiration", () => {
    const now = new Date("2026-09-04T08:00:00Z");
    const service = new InMemoryNonceService({ now: () => now, ttlMs: 60_000 });

    const record = service.issue("abc123DEF456");

    expect(record).toEqual({
      nonce: "abc123DEF456",
      issuedAt: now,
      expirationTime: new Date("2026-09-04T08:01:00Z"),
      consumed: false,
    });
  });

  it("consumes a nonce exactly once", () => {
    const service = new InMemoryNonceService();
    service.issue("abc123DEF456");

    expect(service.consume("abc123DEF456").ok).toBe(true);
    expect(service.consume("abc123DEF456")).toEqual({
      ok: false,
      code: "nonce_consumed",
    });
  });

  it("fails unknown nonces", () => {
    const service = new InMemoryNonceService();

    expect(service.consume("abc123DEF456")).toEqual({
      ok: false,
      code: "nonce_unknown",
    });
  });

  it("fails and consumes expired nonces", () => {
    let current = new Date("2026-09-04T08:00:00Z");
    const service = new InMemoryNonceService({
      now: () => current,
      ttlMs: 1_000,
    });
    service.issue("abc123DEF456");

    current = new Date("2026-09-04T08:00:01Z");

    expect(service.consume("abc123DEF456")).toEqual({
      ok: false,
      code: "nonce_expired",
    });
    expect(service.consume("abc123DEF456")).toEqual({
      ok: false,
      code: "nonce_consumed",
    });
  });

  it("rejects invalid nonce inputs", () => {
    const service = new InMemoryNonceService();

    expect(() => service.issue("short7")).toThrow("at least 8");
    expect(() => service.issue("abc12345!")).toThrow("alphanumeric");
    expect(() => new InMemoryNonceService({ ttlMs: 0 })).toThrow("positive");
    expect(() => new InMemoryNonceService({ nonceLength: 7 })).toThrow(
      "at least 8",
    );
  });

  it("generates unique-looking alphanumeric nonces", () => {
    const nonce = generateNonce(24);

    expect(nonce).toMatch(/^[a-zA-Z0-9]{24}$/);
    expect(new Set([generateNonce(), generateNonce(), generateNonce()]).size).toBe(
      3,
    );
  });
});


import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  InMemorySessionService,
} from "../src/index.js";

const did = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const keyId = "auth-1";

describe("InMemorySessionService", () => {
  it("issues sessions containing only DID, key ID, and timestamps", () => {
    const now = new Date("2026-09-04T08:00:00Z");
    const service = new InMemorySessionService({
      now: () => now,
      ttlMs: 60_000,
    });

    const issued = service.issue(did, keyId, "test-token");

    expect(issued).toEqual({
      token: "test-token",
      session: {
        did,
        keyId,
        issuedAt: now,
        expirationTime: new Date("2026-09-04T08:01:00Z"),
      },
    });
    expect(Object.keys(issued.session).sort()).toEqual([
      "did",
      "expirationTime",
      "issuedAt",
      "keyId",
    ]);
    expect("address" in issued.session).toBe(false);
    expect("lockScript" in issued.session).toBe(false);
  });

  it("returns a cloned session and expires it after TTL", () => {
    let current = new Date("2026-09-04T08:00:00Z");
    const service = new InMemorySessionService({
      now: () => current,
      ttlMs: 1_000,
    });
    service.issue(did, keyId, "test-token");

    expect(service.get("test-token")).toMatchObject({ did, keyId });

    current = new Date("2026-09-04T08:00:01Z");
    expect(service.get("test-token")).toBeUndefined();
  });

  it("clears sessions explicitly", () => {
    const service = new InMemorySessionService();
    service.issue(did, keyId, "test-token");

    expect(service.clear("test-token")).toBe(true);
    expect(service.get("test-token")).toBeUndefined();
  });

  it("generates base64url session tokens", () => {
    expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(() => generateSessionToken(15)).toThrow("at least 16");
    expect(() => new InMemorySessionService({ ttlMs: 0 })).toThrow("positive");
  });
});

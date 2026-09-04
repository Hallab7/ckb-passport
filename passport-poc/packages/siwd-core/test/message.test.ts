import { describe, expect, it } from "vitest";
import {
  buildSiwdMessage,
  parseSiwdMessage,
  SiwdMessageParseError,
  type SiwdMessageFields,
} from "../src/index.js";

describe("buildSiwdMessage", () => {
  it("builds the canonical SIWD message byte-for-byte", () => {
    const fields: SiwdMessageFields = {
      domain: "app.example",
      did: "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba",
      statement: "Sign in to Passport.",
      keyId: "auth-1",
      uri: "https://app.example/login",
      version: "1",
      network: "ckb-testnet",
      nonce: "8f3c1a94e2b7",
      issuedAt: "2026-09-02T10:00:00Z",
      expirationTime: "2026-09-02T10:05:00Z",
    };

    expect(buildSiwdMessage(fields)).toBe(
      `app.example wants you to sign in with your CKB DID:
did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba

Sign in to Passport.

Key ID: auth-1
URI: https://app.example/login
Version: 1
Network: ckb-testnet
Nonce: 8f3c1a94e2b7
Issued At: 2026-09-02T10:00:00Z
Expiration Time: 2026-09-02T10:05:00Z`,
    );
  });

  it("supports localhost authorities without changing the canonical form", () => {
    const message = buildSiwdMessage({
      domain: "localhost:3000",
      did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      statement: "Sign in to the local demo.",
      keyId: "auth-1",
      uri: "http://localhost:3000/login",
      version: "1",
      network: "ckb-testnet",
      nonce: "abc123DEF456",
      issuedAt: "2026-09-04T08:00:00Z",
      expirationTime: "2026-09-04T08:05:00Z",
    });

    expect(message).toContain("localhost:3000 wants you to sign in");
    expect(message).toContain("URI: http://localhost:3000/login");
    expect(message.endsWith("Expiration Time: 2026-09-04T08:05:00Z")).toBe(
      true,
    );
  });
});

describe("parseSiwdMessage", () => {
  const fields: SiwdMessageFields = {
    domain: "app.example",
    did: "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba",
    statement: "Sign in to Passport.",
    keyId: "auth-1",
    uri: "https://app.example/login",
    version: "1",
    network: "ckb-testnet",
    nonce: "8f3c1a94e2b7",
    issuedAt: "2026-09-02T10:00:00Z",
    expirationTime: "2026-09-02T10:05:00Z",
  };

  it("parses canonical builder output", () => {
    expect(parseSiwdMessage(buildSiwdMessage(fields))).toEqual(fields);
  });

  it("rejects missing fields", () => {
    expect(() =>
      parseSiwdMessage(buildSiwdMessage(fields).replace("\nNonce:", "\n")),
    ).toThrow(SiwdMessageParseError);
  });

  it("rejects duplicated fields", () => {
    expect(() =>
      parseSiwdMessage(`${buildSiwdMessage(fields)}\nNonce: replay`),
    ).toThrow(SiwdMessageParseError);
  });

  it("rejects reordered fields", () => {
    const message = buildSiwdMessage(fields)
      .replace("URI: https://app.example/login\nVersion: 1", "Version: 1\nURI: https://app.example/login");

    expect(() => parseSiwdMessage(message)).toThrow(SiwdMessageParseError);
  });

  it("rejects extra unknown fields", () => {
    expect(() =>
      parseSiwdMessage(buildSiwdMessage(fields).replace("Version: 1", "Audience: demo\nVersion: 1")),
    ).toThrow(SiwdMessageParseError);
  });

  it("rejects statements with newlines", () => {
    const message = buildSiwdMessage({
      ...fields,
      statement: "Sign in\nSecond line",
    });

    expect(() => parseSiwdMessage(message)).toThrow(SiwdMessageParseError);
  });

  it("rejects statements beginning with '-'", () => {
    const message = buildSiwdMessage({
      ...fields,
      statement: "- Sign in",
    });

    expect(() => parseSiwdMessage(message)).toThrow(SiwdMessageParseError);
  });

  it("rejects CRLF line endings", () => {
    expect(() =>
      parseSiwdMessage(buildSiwdMessage(fields).replaceAll("\n", "\r\n")),
    ).toThrow(SiwdMessageParseError);
  });
});

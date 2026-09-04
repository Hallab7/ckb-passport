import { ccc } from "@ckb-ccc/core";
import { describe, expect, it } from "vitest";
import {
  hashCkbPersonalMessage,
  recoverableHexToRawSignatureHex,
  WALLET_SIGNING_CONVENTION,
  walletSigningConvention,
} from "../src/index.js";

describe("wallet signing convention", () => {
  it("documents the CCC CKB secp256k1 fallback mode", () => {
    expect(walletSigningConvention).toEqual({
      id: WALLET_SIGNING_CONVENTION,
      cccSignType: "CkbSecp256k1",
      signedPayload: "hashCkb(utf8('Nervos Message:' + message))",
      signerOutput: "0x-prefixed 65-byte recoverable secp256k1 signature",
      proofSignature: "base64url(raw r||s, 64 bytes)",
    });
  });

  it("matches CCC's CKB personal-message hash", () => {
    const message = "app.example wants you to sign in with your CKB DID";

    expect(hashCkbPersonalMessage(message)).toBe(
      ccc.messageHashCkbSecp256k1(message),
    );
    expect(hashCkbPersonalMessage(message)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("converts CCC's recoverable signature into the PoC raw r||s shape", async () => {
    const signer = new ccc.SignerCkbPrivateKey(
      new ccc.ClientPublicTestnet(),
      `0x${"01".repeat(32)}`,
    );
    const message = "wallet mode fixture";
    const signature = await signer.signMessageRaw(message);
    const rawSignature = recoverableHexToRawSignatureHex(signature);

    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(rawSignature).toMatch(/^0x[0-9a-f]{128}$/);
    expect(ccc.verifyMessageCkbSecp256k1(message, signature, signer.publicKey)).toBe(
      true,
    );
  });

  it("rejects signatures that are not 65-byte recoverable hex", () => {
    expect(() => recoverableHexToRawSignatureHex("0x1234")).toThrow(
      "Expected a 0x-prefixed 65-byte recoverable signature",
    );
  });
});


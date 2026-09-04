import { base64UrlDecode, base64UrlEncode } from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import { buildWalletProof, walletSignatureHexToRawBytes } from "../src/index.js";

const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);
const did = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const keyId = "wallet";
const message = "example.test wants you to sign in with your CKB DID:";

describe("walletSignatureHexToRawBytes", () => {
  it("accepts a 64-byte raw signature", () => {
    const rawHex = `0x${"01".repeat(64)}`;

    expect(walletSignatureHexToRawBytes(rawHex)).toEqual(
      Uint8Array.from(new Array(64).fill(0x01)),
    );
  });

  it("strips the recovery byte from a 65-byte recoverable signature", () => {
    const recoverableHex = `0x${"02".repeat(64)}1b`;

    expect(walletSignatureHexToRawBytes(recoverableHex)).toEqual(
      Uint8Array.from(new Array(64).fill(0x02)),
    );
  });

  it("rejects malformed signature hex", () => {
    expect(() => walletSignatureHexToRawBytes("0x1234")).toThrow(
      "Wallet signature must be",
    );
  });
});

describe("buildWalletProof", () => {
  it("returns a wallet proof envelope without WebAuthn fields", async () => {
    const rawSignature = Uint8Array.from([
      ...new Array(32).fill(0x01),
      ...scalarFromBigInt(2n),
    ]);

    const proof = await buildWalletProof(
      {
        did,
        keyId,
        message,
      },
      async () => `${base64UrlHex(rawSignature)}1b`,
    );

    expect(proof).toEqual({
      v: 1,
      did,
      keyId,
      message,
      mode: "wallet",
      signature: base64UrlEncode(rawSignature),
    });
    expect("clientDataJSON" in proof).toBe(false);
    expect("authenticatorData" in proof).toBe(false);
    expect("address" in proof).toBe(false);
  });

  it("normalizes high-S wallet signatures locally", async () => {
    const r = scalarFromBigInt(4n);
    const highS = scalarFromBigInt(SECP256K1_ORDER - 1n);
    const lowS = scalarFromBigInt(1n);

    const proof = await buildWalletProof(
      {
        did,
        keyId,
        message,
      },
      async () => base64UrlHex(Uint8Array.from([...r, ...highS])),
    );

    expect(base64UrlDecode(proof.signature)).toEqual(
      Uint8Array.from([...r, ...lowS]),
    );
  });

  it("wraps wallet signing errors", async () => {
    await expect(
      buildWalletProof({ did, keyId, message }, async () => {
        throw new Error("rejected");
      }),
    ).rejects.toThrow("Wallet signing failed: rejected");
  });
});

function base64UrlHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function scalarFromBigInt(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

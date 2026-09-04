import {
  base64UrlEncode,
  encodeDidKey,
  hexToBytes,
  type DecodedDidKey,
} from "@ckb-passport/siwd-core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { describe, expect, it } from "vitest";
import {
  hashCkbPersonalMessage,
  verifyWalletSignature,
  type WalletSiwdProofEnvelope,
} from "../src/index.js";

const SECP256K1_ORDER = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);
const privateKey = Uint8Array.from(new Array(32).fill(1));
const publicKey = secp256k1.getPublicKey(privateKey, true);
const message = "wallet mode fixture";

describe("verifyWalletSignature", () => {
  it("passes a valid wallet proof", () => {
    const proof = walletProof(signMessage(message));

    expect(
      verifyWalletSignature({
        proof,
        verificationMethod: selectedMethod(publicKey, "secp256k1"),
      }),
    ).toEqual({ ok: true });
  });

  it("fails when the message is tampered", () => {
    const proof = {
      ...walletProof(signMessage(message)),
      message: "tampered",
    };

    expect(
      verifyWalletSignature({
        proof,
        verificationMethod: selectedMethod(publicKey, "secp256k1"),
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_verification_failed",
    });
  });

  it("rejects incoming high-S signatures", () => {
    const low = signMessage(message);
    const high = Uint8Array.from([
      ...low.slice(0, 32),
      ...scalarFromBigInt(SECP256K1_ORDER - scalarToBigInt(low.slice(32))),
    ]);

    expect(
      verifyWalletSignature({
        proof: walletProof(high),
        verificationMethod: selectedMethod(publicKey, "secp256k1"),
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_high_s",
    });
  });

  it("fails with the wrong public key", () => {
    const wrongPublicKey = secp256k1.getPublicKey(
      Uint8Array.from(new Array(32).fill(2)),
      true,
    );

    expect(
      verifyWalletSignature({
        proof: walletProof(signMessage(message)),
        verificationMethod: selectedMethod(wrongPublicKey, "secp256k1"),
      }),
    ).toMatchObject({
      ok: false,
      code: "signature_verification_failed",
    });
  });

  it("rejects non-wallet proof mode and wrong verification method curve", () => {
    expect(
      verifyWalletSignature({
        proof: {
          ...walletProof(signMessage(message)),
          mode: "webauthn",
          clientDataJSON: "AA",
          authenticatorData: "AA",
        },
        verificationMethod: selectedMethod(publicKey, "secp256k1"),
      }),
    ).toMatchObject({
      ok: false,
      code: "proof_mode_invalid",
    });

    expect(
      verifyWalletSignature({
        proof: walletProof(signMessage(message)),
        verificationMethod: selectedMethod(
          Uint8Array.from([0x02, ...new Array(32).fill(3)]),
          "p256",
        ),
      }),
    ).toMatchObject({
      ok: false,
      code: "curve_mismatch",
    });
  });
});

function signMessage(value: string): Uint8Array {
  return secp256k1.sign(
    hexToBytes(hashCkbPersonalMessage(value)),
    privateKey,
    {
      prehash: false,
      lowS: true,
      format: "compact",
    },
  );
}

function walletProof(signature: Uint8Array): WalletSiwdProofEnvelope {
  return {
    v: 1,
    did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    keyId: "wallet",
    message,
    mode: "wallet",
    signature: base64UrlEncode(signature),
  };
}

function selectedMethod(
  compressedPublicKey: Uint8Array,
  curve: "secp256k1" | "p256",
) {
  const didKey = encodeDidKey(curve, compressedPublicKey);
  const decoded: DecodedDidKey = {
    didKey,
    curve,
    multicodecVarint:
      curve === "secp256k1" ? Uint8Array.from([0xe7, 0x01]) : Uint8Array.from([0x80, 0x24]),
    publicKeyCompressed: compressedPublicKey,
  };

  return {
    ok: true as const,
    keyId: "wallet",
    didKey,
    decoded,
  };
}

function scalarToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
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

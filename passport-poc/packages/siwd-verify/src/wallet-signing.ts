import { ccc } from "@ckb-ccc/core";

export const WALLET_SIGNING_CONVENTION = "ccc-ckb-secp256k1";
export const WALLET_SIGNATURE_HEX_LENGTH = 132;
export const WALLET_RAW_SIGNATURE_HEX_LENGTH = 130;

export type WalletSigningConvention = {
  id: typeof WALLET_SIGNING_CONVENTION;
  cccSignType: "CkbSecp256k1";
  signedPayload: "hashCkb(utf8('Nervos Message:' + message))";
  signerOutput: "0x-prefixed 65-byte recoverable secp256k1 signature";
  proofSignature: "base64url(raw r||s, 64 bytes)";
};

export const walletSigningConvention: WalletSigningConvention = {
  id: WALLET_SIGNING_CONVENTION,
  cccSignType: "CkbSecp256k1",
  signedPayload: "hashCkb(utf8('Nervos Message:' + message))",
  signerOutput: "0x-prefixed 65-byte recoverable secp256k1 signature",
  proofSignature: "base64url(raw r||s, 64 bytes)",
};

export function hashCkbPersonalMessage(message: string | Uint8Array): string {
  return ccc.messageHashCkbSecp256k1(message);
}

export function recoverableHexToRawSignatureHex(signature: string): string {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Expected a 0x-prefixed 65-byte recoverable signature");
  }

  return `0x${signature.slice(2, WALLET_RAW_SIGNATURE_HEX_LENGTH)}`;
}


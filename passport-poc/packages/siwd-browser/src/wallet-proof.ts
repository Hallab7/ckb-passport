import {
  base64UrlEncode,
  hexToBytes,
  normalizeRawEcdsaSignature,
} from "@ckb-passport/siwd-core";

export type WalletMessageSigner = (message: string) => Promise<string>;

export type WalletProofOptions = {
  did: string;
  keyId: string;
  message: string;
};

export type WalletProofEnvelope = {
  v: 1;
  did: string;
  keyId: string;
  message: string;
  mode: "wallet";
  signature: string;
};

export class WalletProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletProofError";
  }
}

export async function buildWalletProof(
  options: WalletProofOptions,
  signMessageRaw: WalletMessageSigner,
): Promise<WalletProofEnvelope> {
  let signatureHex: string;
  try {
    signatureHex = await signMessageRaw(options.message);
  } catch (error) {
    throw new WalletProofError(
      error instanceof Error
        ? `Wallet signing failed: ${error.message}`
        : "Wallet signing failed",
    );
  }

  const rawSignature = walletSignatureHexToRawBytes(signatureHex);
  const lowSSignature = normalizeRawEcdsaSignature("secp256k1", rawSignature);

  return {
    v: 1,
    did: options.did,
    keyId: options.keyId,
    message: options.message,
    mode: "wallet",
    signature: base64UrlEncode(lowSSignature),
  };
}

export function walletSignatureHexToRawBytes(signatureHex: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{128}(?:[0-9a-fA-F]{2})?$/.test(signatureHex)) {
    throw new WalletProofError(
      "Wallet signature must be a 0x-prefixed 64-byte raw or 65-byte recoverable ECDSA signature",
    );
  }

  return hexToBytes(`0x${signatureHex.slice(2, 130)}`);
}

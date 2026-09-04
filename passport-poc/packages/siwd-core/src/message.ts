export type SiwdNetwork = "ckb-testnet" | "ckb-mainnet";

export type SiwdMessageFields = {
  domain: string;
  did: string;
  statement: string;
  keyId: string;
  uri: string;
  version: "1";
  network: SiwdNetwork;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export function buildSiwdMessage(fields: SiwdMessageFields): string {
  return `${fields.domain} wants you to sign in with your CKB DID:
${fields.did}

${fields.statement}

Key ID: ${fields.keyId}
URI: ${fields.uri}
Version: ${fields.version}
Network: ${fields.network}
Nonce: ${fields.nonce}
Issued At: ${fields.issuedAt}
Expiration Time: ${fields.expirationTime}`;
}


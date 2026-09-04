import { ccc } from "@ckb-ccc/core";

export type PassportPocNetwork = "ckb-testnet";
export type CkbHashType = "data" | "type" | "data1" | "data2";

export type PassportPocConfig = {
  network: PassportPocNetwork;
  ckbRpcUrl: string;
  ckbIndexerUrl: string;
  didCodeHash: string;
  didHashType: CkbHashType;
  expectedOrigin: string;
};

export type ConfigEnv = Record<string, string | undefined>;

const DEFAULT_NETWORK: PassportPocNetwork = "ckb-testnet";
const DEFAULT_CKB_RPC_URL = "https://testnet.ckb.dev/";
const DEFAULT_CKB_INDEXER_URL = "https://testnet.ckb.dev/indexer";
const DEFAULT_EXPECTED_ORIGIN = "http://localhost:3000";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadPassportPocConfig(
  env: ConfigEnv = process.env,
): Promise<PassportPocConfig> {
  const network = parseNetwork(env.CKB_PASSPORT_NETWORK ?? DEFAULT_NETWORK);
  const scriptInfo = await getDidKnownScript();
  const didCodeHash = parseCodeHash(
    env.CKB_DID_CODE_HASH ?? scriptInfo.codeHash,
    "CKB_DID_CODE_HASH",
  );
  const didHashType = parseHashType(
    env.CKB_DID_HASH_TYPE ?? scriptInfo.hashType,
    "CKB_DID_HASH_TYPE",
  );

  return {
    network,
    ckbRpcUrl: parseUrl(env.CKB_RPC_URL ?? DEFAULT_CKB_RPC_URL, "CKB_RPC_URL"),
    ckbIndexerUrl: parseUrl(
      env.CKB_INDEXER_URL ?? DEFAULT_CKB_INDEXER_URL,
      "CKB_INDEXER_URL",
    ),
    didCodeHash,
    didHashType,
    expectedOrigin: parseOrigin(
      env.SIWD_EXPECTED_ORIGIN ?? DEFAULT_EXPECTED_ORIGIN,
      "SIWD_EXPECTED_ORIGIN",
    ),
  };
}

export async function getDidKnownScript(): Promise<{
  codeHash: string;
  hashType: CkbHashType;
}> {
  const client = new ccc.ClientPublicTestnet();
  const scriptInfo = await client.getKnownScript(ccc.KnownScript.DidCkb);

  return {
    codeHash: parseCodeHash(scriptInfo.codeHash, "KnownScript.DidCkb.codeHash"),
    hashType: parseHashType(scriptInfo.hashType, "KnownScript.DidCkb.hashType"),
  };
}

function parseNetwork(value: string): PassportPocNetwork {
  if (value !== "ckb-testnet") {
    throw new ConfigError(
      `CKB_PASSPORT_NETWORK must be ckb-testnet for the PoC, got ${value}`,
    );
  }
  return value;
}

function parseCodeHash(value: string, field: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ConfigError(`${field} must be a 32-byte 0x-prefixed hex string`);
  }
  return value.toLowerCase();
}

function parseHashType(value: string, field: string): CkbHashType {
  if (
    value !== "data" &&
    value !== "type" &&
    value !== "data1" &&
    value !== "data2"
  ) {
    throw new ConfigError(`${field} must be data, type, data1, or data2`);
  }
  return value;
}

function parseUrl(value: string, field: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:" &&
      url.protocol !== "ws:" &&
      url.protocol !== "wss:"
    ) {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw new ConfigError(`${field} must be an absolute HTTP(S) or WS(S) URL`);
  }
}

function parseOrigin(value: string, field: string): string {
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      throw new Error("not origin only");
    }
    return url.origin;
  } catch {
    throw new ConfigError(`${field} must be an origin like http://localhost:3000`);
  }
}


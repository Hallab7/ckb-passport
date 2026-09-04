import { describe, expect, it } from "vitest";
import {
  ConfigError,
  getDidKnownScript,
  loadPassportPocConfig,
} from "../src/index.js";

describe("loadPassportPocConfig", () => {
  it("loads testnet defaults from CCC known-script metadata", async () => {
    const config = await loadPassportPocConfig({});

    expect(config.network).toBe("ckb-testnet");
    expect(config.ckbRpcUrl).toBe("https://testnet.ckb.dev/");
    expect(config.ckbIndexerUrl).toBe("https://testnet.ckb.dev/indexer");
    expect(config.expectedOrigin).toBe("http://localhost:3000");
    expect(config.didCodeHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(config.didHashType).toBe("type");
  });

  it("allows explicit testnet endpoint and DID script overrides", async () => {
    const config = await loadPassportPocConfig({
      CKB_PASSPORT_NETWORK: "ckb-testnet",
      CKB_RPC_URL: "http://127.0.0.1:8114",
      CKB_INDEXER_URL: "http://127.0.0.1:8116",
      CKB_DID_CODE_HASH: `0x${"ab".repeat(32)}`,
      CKB_DID_HASH_TYPE: "data1",
      SIWD_EXPECTED_ORIGIN: "http://localhost:4173",
    });

    expect(config).toEqual({
      network: "ckb-testnet",
      ckbRpcUrl: "http://127.0.0.1:8114/",
      ckbIndexerUrl: "http://127.0.0.1:8116/",
      didCodeHash: `0x${"ab".repeat(32)}`,
      didHashType: "data1",
      expectedOrigin: "http://localhost:4173",
    });
  });

  it("rejects mainnet runtime configuration for the PoC", async () => {
    await expect(
      loadPassportPocConfig({ CKB_PASSPORT_NETWORK: "ckb-mainnet" }),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects malformed DID deployment settings", async () => {
    await expect(
      loadPassportPocConfig({ CKB_DID_CODE_HASH: "0x1234" }),
    ).rejects.toThrow("CKB_DID_CODE_HASH must be a 32-byte");

    await expect(
      loadPassportPocConfig({
        CKB_DID_CODE_HASH: `0x${"11".repeat(32)}`,
        CKB_DID_HASH_TYPE: "bad",
      }),
    ).rejects.toThrow("CKB_DID_HASH_TYPE must be");
  });
});

describe("getDidKnownScript", () => {
  it("returns the testnet did:ckb type script configured by CCC", async () => {
    const script = await getDidKnownScript();

    expect(script).toEqual({
      codeHash:
        "0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5",
      hashType: "type",
    });
  });
});


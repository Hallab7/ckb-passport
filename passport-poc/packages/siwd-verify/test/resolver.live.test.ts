import { ccc } from "@ckb-ccc/core";
import { describe, expect, it } from "vitest";
import { resolveDidCell } from "../src/index.js";

const liveDid = process.env.CKB_PASSPORT_LIVE_DID;

describe("resolveDidCell live testnet query", () => {
  it.runIf(liveDid)(
    "resolves a configured testnet DID from live cells",
    async () => {
      const result = await resolveDidCell({
        client: new ccc.ClientPublicTestnet(),
        did: liveDid!,
      });

      expect(result.ok).toBe(true);
    },
    30_000,
  );

  it("documents how to enable the live test", () => {
    expect(
      "Set CKB_PASSPORT_LIVE_DID to a known live testnet did:ckb identifier.",
    ).toContain("CKB_PASSPORT_LIVE_DID");
  });
});


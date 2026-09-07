import { describe, expect, it } from "vitest";
import { POST } from "../app/api/evidence/explorer/route.js";

describe("explorer evidence route", () => {
  it("returns JSON evidence for a valid confirmed update", async () => {
    const request = new Request("http://localhost/api/evidence/explorer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        did: `did:ckb:${"a".repeat(32)}`,
        keyId: "auth-1",
        didKey: "did:key:zDna-test",
        txHash: `0x${"11".repeat(32)}`,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      network: "ckb-testnet",
      keyId: "auth-1",
      updateTransactionHash: `0x${"11".repeat(32)}`,
    });
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

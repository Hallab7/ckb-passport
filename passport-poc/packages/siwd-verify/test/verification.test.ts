import { ccc } from "@ckb-ccc/core";
import { DidCkbData } from "@ckb-ccc/did-ckb";
import { parseSiwdMessage } from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import vectors from "../../../vectors/vectors.json" with { type: "json" };
import {
  InMemoryNonceService,
  verifySiwdProof,
  type SiwdTestVector,
} from "../src/index.js";

describe("verifySiwdProof nonce transaction", () => {
  it("does not consume a nonce when signature verification fails", async () => {
    const baseline = (vectors as SiwdTestVector[]).find(
      (vector) => vector.name === "valid-software",
    );
    if (!baseline) {
      throw new Error("software positive vector is missing");
    }

    const now = new Date(baseline.now ?? "2026-09-04T08:00:00Z");
    const nonce = parseSiwdMessage(baseline.proof.message).nonce;
    const nonceService = new InMemoryNonceService({ now: () => now });
    nonceService.issue(nonce);
    const proof = { ...baseline.proof, signature: "AA" };

    const result = await verifySiwdProof({
      proof,
      expectedOrigin: baseline.expectedOrigin,
      expectedNetwork: baseline.network,
      nonceService,
      now,
      client: fixtureClient(baseline.resolver.document),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "signature_invalid",
    });
    expect(nonceService.get(nonce)).toMatchObject({
      consumed: false,
      reserved: false,
    });
  });
});

function fixtureClient(document: unknown): ccc.Client {
  const cell = {
    outputData: DidCkbData.encode(
      DidCkbData.fromV1({ document: document ?? { verificationMethods: {} } }),
    ),
  } as unknown as ccc.Cell;

  return {
    getKnownScript: async () => ({
      codeHash: `0x${"99".repeat(32)}`,
      hashType: "type",
    }),
    findCellsByType: async function* () {
      yield cell;
    },
  } as unknown as ccc.Client;
}

import { parseSiwdMessage, type SiwdNetwork } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData } from "@ckb-ccc/did-ckb";
import type { DidCkbDocument } from "./document.js";
import { InMemoryNonceService } from "./nonce.js";
import type { SiwdProofEnvelope } from "./proof.js";
import { verifySiwdProof } from "./verification.js";

export type SiwdVectorExpectation = "pass" | "fail";
export type SiwdVectorNonceState = "issued" | "consumed" | "missing";

export type SiwdTestVector = {
  name: string;
  proof: SiwdProofEnvelope;
  expectedOrigin: string;
  network: SiwdNetwork;
  expect: SiwdVectorExpectation;
  reason: string;
  expectedFailure?: string;
  rpId?: string;
  now?: string;
  nonceState?: SiwdVectorNonceState;
  resolver: {
    liveCells: 0 | 1 | 2;
    document?: DidCkbDocument;
  };
};

export type SiwdVectorEvaluation = {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
  reason: string;
};

export async function evaluateSiwdVector(
  vector: SiwdTestVector,
): Promise<SiwdVectorEvaluation> {
  const result = await verifySiwdProof({
    proof: vector.proof,
    expectedOrigin: vector.expectedOrigin,
    expectedNetwork: vector.network,
    nonceService: nonceServiceForVector(vector),
    now: new Date(vector.now ?? "2026-09-04T08:00:00Z"),
    client: fixtureClient(vector.resolver),
    rpId: vector.rpId,
  });

  const actual = result.ok ? "pass" : result.code;
  const expected = vector.expect === "pass" ? "pass" : vector.expectedFailure;

  return {
    name: vector.name,
    ok: actual === expected,
    expected: expected ?? "fail",
    actual,
    reason: vector.reason,
  };
}

function nonceServiceForVector(vector: SiwdTestVector): InMemoryNonceService {
  const now = new Date(vector.now ?? "2026-09-04T08:00:00Z");
  const service = new InMemoryNonceService({ now: () => now });
  let nonce: string | undefined;
  try {
    nonce = parseSiwdMessage(vector.proof.message).nonce;
  } catch {
    return service;
  }

  if (vector.nonceState !== "missing") {
    service.issue(nonce);
  }
  if (vector.nonceState === "consumed") {
    service.consume(nonce);
  }
  return service;
}

function fixtureClient(resolver: SiwdTestVector["resolver"]): ccc.Client {
  const cells =
    resolver.liveCells === 0
      ? []
      : new Array(resolver.liveCells)
          .fill(undefined)
          .map(() => fixtureCell(resolver.document));

  return {
    getKnownScript: async () => ({
      codeHash: `0x${"99".repeat(32)}`,
      hashType: "type",
    }),
    findCellsByType: async function* () {
      for (const cell of cells) {
        yield cell;
      }
    },
  } as unknown as ccc.Client;
}

function fixtureCell(document: unknown): ccc.Cell {
  return {
    outputData: DidCkbData.encode(
      DidCkbData.fromV1({
        document: document ?? { verificationMethods: {} },
      }),
    ),
  } as unknown as ccc.Cell;
}

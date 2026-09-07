import { describe, expect, it } from "vitest";
import vectors from "../../../vectors/vectors.json" with { type: "json" };
import { evaluateSiwdVector, type SiwdTestVector } from "../src/index.js";

describe("vectors/vectors.json", () => {
  it.each(vectors as SiwdTestVector[])("$name", async (vector) => {
    const result = await evaluateSiwdVector(vector);

    expect(result).toMatchObject({
      ok: true,
      expected: vector.expect === "pass" ? "pass" : vector.expectedFailure,
      ...(vector.expect === "fail" ? { failsAtStep: vector.failsAtStep } : {}),
    });
  });

  it("contains the complete proof-plan matrix with localized failures", () => {
    const names = (vectors as SiwdTestVector[]).map((vector) => vector.name);
    expect(names).toEqual([
      "valid-webauthn",
      "valid-software",
      "wrong-domain",
      "wrong-uri-origin",
      "bad-version",
      "wrong-network",
      "expired",
      "future-issued",
      "replayed-nonce",
      "malformed-did",
      "did-not-found",
      "duplicate-cells",
      "keyid-absent",
      "unsupported-multicodec",
      "wrong-key-signature",
      "high-s",
      "der-encoded",
      "curve-confusion",
      "webauthn-origin-mismatch",
      "challenge-mismatch",
      "rpid-mismatch",
      "up-clear",
      "wrong-type",
    ]);
    for (const vector of vectors as SiwdTestVector[]) {
      if (vector.expect === "fail") {
        expect(vector.failsAtStep).toBeTruthy();
      }
    }
  });
});

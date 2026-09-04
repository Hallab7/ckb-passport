import { describe, expect, it } from "vitest";
import vectors from "../../../vectors/vectors.json" with { type: "json" };
import { evaluateSiwdVector, type SiwdTestVector } from "../src/index.js";

describe("vectors/vectors.json", () => {
  it.each(vectors as SiwdTestVector[])("$name", async (vector) => {
    const result = await evaluateSiwdVector(vector);

    expect(result).toMatchObject({
      ok: true,
      expected: vector.expect === "pass" ? "pass" : vector.expectedFailure,
    });
  });
});

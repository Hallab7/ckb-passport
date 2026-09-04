import { ccc } from "@ckb-ccc/core";
import { DidCkbData } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import {
  decodeDidDocumentFromCell,
  validateDidCkbDocument,
} from "../src/index.js";

describe("decodeDidDocumentFromCell", () => {
  it("decodes SDK Molecule and DAG-CBOR DID document data", () => {
    const document = {
      verificationMethods: {
        "auth-1": "did:key:zDnaeWhtsampleplaceholder",
      },
      alsoKnownAs: ["at://alice.test"],
      services: {},
    };
    const cell = fakeCell(
      DidCkbData.encode(DidCkbData.fromV1({ document })),
    );

    expect(decodeDidDocumentFromCell(cell)).toMatchObject({
      ok: true,
      document,
    });
  });

  it("fails closed when cell data is missing", () => {
    expect(decodeDidDocumentFromCell({} as ccc.Cell)).toEqual({
      ok: false,
      code: "did_cell_data_missing",
      message: "DID cell outputData is missing",
    });
  });

  it("fails closed when cell data cannot decode", () => {
    expect(decodeDidDocumentFromCell(fakeCell("0x1234"))).toMatchObject({
      ok: false,
      code: "did_cell_data_decode_failed",
    });
  });
});

describe("validateDidCkbDocument", () => {
  it("accepts the minimal PoC document shape", () => {
    expect(
      validateDidCkbDocument({
        verificationMethods: {
          "auth-1": "did:key:zDnaeWhtsampleplaceholder",
        },
      }),
    ).toMatchObject({
      ok: true,
      document: {
        verificationMethods: {
          "auth-1": "did:key:zDnaeWhtsampleplaceholder",
        },
      },
    });
  });

  it("rejects forbidden did:plc fields", () => {
    for (const field of ["type", "rotationKeys", "prev", "sig"]) {
      expect(
        validateDidCkbDocument({
          verificationMethods: {},
          [field]: "forbidden",
        }),
      ).toMatchObject({
        ok: false,
        code: "did_document_forbidden_field",
      });
    }
  });

  it("rejects malformed document fields", () => {
    expect(validateDidCkbDocument(null)).toMatchObject({
      ok: false,
      code: "did_document_invalid",
    });
    expect(validateDidCkbDocument({ verificationMethods: [] })).toMatchObject({
      ok: false,
      code: "did_document_invalid",
    });
    expect(
      validateDidCkbDocument({ verificationMethods: { "auth-1": 1 } }),
    ).toMatchObject({
      ok: false,
      code: "did_document_invalid",
    });
    expect(
      validateDidCkbDocument({
        verificationMethods: {},
        alsoKnownAs: [1],
      }),
    ).toMatchObject({
      ok: false,
      code: "did_document_invalid",
    });
    expect(
      validateDidCkbDocument({
        verificationMethods: {},
        services: [],
      }),
    ).toMatchObject({
      ok: false,
      code: "did_document_invalid",
    });
  });
});

function fakeCell(outputData: ccc.BytesLike): ccc.Cell {
  return { outputData } as unknown as ccc.Cell;
}


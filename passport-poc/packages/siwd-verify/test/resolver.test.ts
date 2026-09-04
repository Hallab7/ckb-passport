import { ccc } from "@ckb-ccc/core";
import { argsToDid } from "@ckb-ccc/did-ckb";
import { describe, expect, it } from "vitest";
import { buildDidTypeScript, resolveDidCell } from "../src/index.js";

const didCodeHash =
  "0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5";
const didArgs = `0x${"11".repeat(20)}`;
const did = argsToDid(didArgs);

describe("resolveDidCell", () => {
  it("builds the testnet DID type script from the known CCC script", async () => {
    const client = fakeClient([]);

    await expect(buildDidTypeScript(client, didArgs)).resolves.toMatchObject({
      codeHash: didCodeHash,
      hashType: "type",
      args: didArgs,
    });
  });

  it("returns the single live DID cell", async () => {
    const cell = fakeCell("0x01");
    const result = await resolveDidCell({
      client: fakeClient([cell]),
      did,
    });

    expect(result).toMatchObject({
      ok: true,
      did,
      id: didArgs,
    });
    expect(result.ok && result.cell).toBe(cell);
  });

  it("fails closed when the DID resolves to zero live cells", async () => {
    const result = await resolveDidCell({
      client: fakeClient([]),
      did,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_not_found_or_deactivated",
      cellCount: 0,
    });
  });

  it("fails closed when duplicate live cells are found", async () => {
    const result = await resolveDidCell({
      client: fakeClient([fakeCell("0x01"), fakeCell("0x02")]),
      did,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_ambiguous",
      cellCount: 2,
    });
  });

  it("rejects malformed DID identifiers", async () => {
    const result = await resolveDidCell({
      client: fakeClient([]),
      did: "did:ckb:bad",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "did_invalid",
    });
  });
});

function fakeClient(cells: ccc.Cell[]): ccc.Client {
  return {
    async getKnownScript(script: ccc.KnownScript) {
      expect(script).toBe(ccc.KnownScript.DidCkb);
      return ccc.ScriptInfo.from({
        codeHash: didCodeHash,
        hashType: "type",
        cellDeps: [],
      });
    },
    async *findCellsByType(type: ccc.ScriptLike) {
      expect(ccc.Script.from(type)).toMatchObject({
        codeHash: didCodeHash,
        hashType: "type",
        args: didArgs,
      });
      for (const cell of cells) {
        yield cell;
      }
    },
  } as unknown as ccc.Client;
}

function fakeCell(id: string): ccc.Cell {
  return { id } as unknown as ccc.Cell;
}


import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";

export type DidCellResolution =
  | {
      ok: true;
      did: string;
      id: string;
      typeScript: ccc.Script;
      cell: ccc.Cell;
    }
  | {
      ok: false;
      code: "did_invalid" | "did_not_found_or_deactivated" | "did_ambiguous";
      message: string;
      did: string;
      id?: string;
      typeScript?: ccc.Script;
      cellCount?: number;
    };

export type ResolveDidCellOptions = {
  client: ccc.Client;
  did: string;
  includeTxPool?: boolean;
};

export async function resolveDidCell(
  options: ResolveDidCellOptions,
): Promise<DidCellResolution> {
  let id: string;
  try {
    id = didToArgs(options.did);
  } catch (error) {
    return {
      ok: false,
      code: "did_invalid",
      message: error instanceof Error ? error.message : "Invalid did:ckb identifier",
      did: options.did,
    };
  }

  const typeScript = await buildDidTypeScript(options.client, id);
  const cells: ccc.Cell[] = [];
  for await (const cell of options.client.findCellsByType(
    typeScript,
    true,
    undefined,
    2,
  )) {
    cells.push(cell);
    if (cells.length > 1) {
      break;
    }
  }

  if (cells.length === 0) {
    return {
      ok: false,
      code: "did_not_found_or_deactivated",
      message: "DID resolved to zero live cells",
      did: options.did,
      id,
      typeScript,
      cellCount: 0,
    };
  }

  if (cells.length > 1) {
    return {
      ok: false,
      code: "did_ambiguous",
      message: "DID resolved to more than one live cell",
      did: options.did,
      id,
      typeScript,
      cellCount: cells.length,
    };
  }

  return {
    ok: true,
    did: options.did,
    id,
    typeScript,
    cell: cells[0],
  };
}

export async function buildDidTypeScript(
  client: ccc.Client,
  id: string,
): Promise<ccc.Script> {
  const scriptInfo = await client.getKnownScript(ccc.KnownScript.DidCkb);
  return ccc.Script.from({
    codeHash: scriptInfo.codeHash,
    hashType: scriptInfo.hashType,
    args: id,
  });
}


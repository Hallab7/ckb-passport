export type SiwdNetwork = "ckb-testnet" | "ckb-mainnet";

export type SiwdMessageFields = {
  domain: string;
  did: string;
  statement: string;
  keyId: string;
  uri: string;
  version: "1";
  network: SiwdNetwork;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export type ParsedSiwdMessageFields = Omit<
  SiwdMessageFields,
  "version" | "network"
> & {
  version: string;
  network: string;
};

export type SiwdMessageParseErrorCode =
  | "crlf_not_canonical"
  | "line_count_invalid"
  | "domain_line_invalid"
  | "blank_line_invalid"
  | "statement_invalid"
  | "field_line_invalid";

export class SiwdMessageParseError extends Error {
  constructor(
    public readonly code: SiwdMessageParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SiwdMessageParseError";
  }
}

export function buildSiwdMessage(fields: SiwdMessageFields): string {
  return `${fields.domain} wants you to sign in with your CKB DID:
${fields.did}

${fields.statement}

Key ID: ${fields.keyId}
URI: ${fields.uri}
Version: ${fields.version}
Network: ${fields.network}
Nonce: ${fields.nonce}
Issued At: ${fields.issuedAt}
Expiration Time: ${fields.expirationTime}`;
}

export function parseSiwdMessage(message: string): ParsedSiwdMessageFields {
  if (message.includes("\r")) {
    throw new SiwdMessageParseError(
      "crlf_not_canonical",
      "SIWD messages must use LF line endings",
    );
  }

  const lines = message.split("\n");
  if (lines.length !== 12) {
    throw new SiwdMessageParseError(
      "line_count_invalid",
      `Expected 12 SIWD message lines, got ${lines.length}`,
    );
  }

  const domainSuffix = " wants you to sign in with your CKB DID:";
  if (!lines[0].endsWith(domainSuffix)) {
    throw new SiwdMessageParseError(
      "domain_line_invalid",
      "SIWD domain line is not canonical",
    );
  }
  const domain = lines[0].slice(0, -domainSuffix.length);
  if (domain.length === 0) {
    throw new SiwdMessageParseError(
      "domain_line_invalid",
      "SIWD domain must not be empty",
    );
  }

  if (lines[2] !== "" || lines[4] !== "") {
    throw new SiwdMessageParseError(
      "blank_line_invalid",
      "SIWD blank lines are not canonical",
    );
  }

  const statement = lines[3];
  if (statement.startsWith("-")) {
    throw new SiwdMessageParseError(
      "statement_invalid",
      "SIWD statement must not start with '-'",
    );
  }

  return {
    domain,
    did: parseFieldLine(lines[1], "", "DID line"),
    statement,
    keyId: parseFieldLine(lines[5], "Key ID: ", "Key ID"),
    uri: parseFieldLine(lines[6], "URI: ", "URI"),
    version: parseFieldLine(lines[7], "Version: ", "Version"),
    network: parseFieldLine(lines[8], "Network: ", "Network"),
    nonce: parseFieldLine(lines[9], "Nonce: ", "Nonce"),
    issuedAt: parseFieldLine(lines[10], "Issued At: ", "Issued At"),
    expirationTime: parseFieldLine(
      lines[11],
      "Expiration Time: ",
      "Expiration Time",
    ),
  };
}

function parseFieldLine(line: string, prefix: string, field: string): string {
  if (prefix === "") {
    if (line.length === 0 || line.includes(": ")) {
      throw new SiwdMessageParseError(
        "field_line_invalid",
        `${field} is not canonical`,
      );
    }
    return line;
  }

  if (!line.startsWith(prefix)) {
    throw new SiwdMessageParseError(
      "field_line_invalid",
      `${field} line is not canonical`,
    );
  }

  return line.slice(prefix.length);
}

import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ccc } from "@ckb-ccc/core";
import { buildSiwdMessage, type SiwdMessageFields } from "@ckb-passport/siwd-core";
import {
  InMemoryNonceService,
  InMemorySessionService,
  loadPassportPocConfig,
  verifySiwdProof,
  type PassportPocConfig,
  type PassportSession,
  type VerifySiwdProofResult,
} from "@ckb-passport/siwd-verify";

export type DemoProofVerifier = (options: {
  proof: unknown;
  expectedOrigin: string;
  expectedNetwork: PassportPocConfig["network"];
  nonceService: InMemoryNonceService;
  client: ccc.Client;
  rpId: string;
}) => Promise<VerifySiwdProofResult>;

export type DemoServerOptions = {
  config: PassportPocConfig;
  client: ccc.Client;
  nonceService?: InMemoryNonceService;
  sessionService?: InMemorySessionService;
  verifyProof?: DemoProofVerifier;
  publicDir?: string;
};

const SESSION_COOKIE = "ckb_passport_session";
const DEFAULT_PORT = 3000;
const SIWD_STATEMENT = "Sign in to Passport PoC";
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

export function createDemoServer(options: DemoServerOptions): Server {
  const nonceService = options.nonceService ?? new InMemoryNonceService();
  const sessionService = options.sessionService ?? new InMemorySessionService();
  const verifyProof = options.verifyProof ?? verifySiwdProof;
  const publicDir = options.publicDir ?? PUBLIC_DIR;

  return createServer(async (request, response) => {
    try {
      const url = requestUrl(request, options.config.expectedOrigin);

      if (request.method === "GET" && url.pathname === "/api/config") {
        return sendJson(response, 200, configPayload(options.config));
      }

      if (request.method === "GET" && url.pathname === "/api/nonce") {
        const nonce = nonceService.issue();
        const payload: Record<string, unknown> = {
          ok: true,
          nonce: nonce.nonce,
          issuedAt: nonce.issuedAt.toISOString(),
          expirationTime: nonce.expirationTime.toISOString(),
          expectedOrigin: options.config.expectedOrigin,
          network: options.config.network,
          rpId: new URL(options.config.expectedOrigin).hostname,
        };
        const did = url.searchParams.get("did");
        const keyId = url.searchParams.get("keyId");
        if (did && keyId) {
          payload.message = buildDemoMessage(options.config, {
            did,
            keyId,
            nonce: nonce.nonce,
            issuedAt: nonce.issuedAt,
            expirationTime: nonce.expirationTime,
          });
        }
        return sendJson(response, 200, payload);
      }

      if (request.method === "POST" && url.pathname === "/api/verify") {
        const body = await readJson(request);
        const proof = isRecord(body) && "proof" in body ? body.proof : body;
        const result = await verifyProof({
          proof,
          expectedOrigin: options.config.expectedOrigin,
          expectedNetwork: options.config.network,
          nonceService,
          client: options.client,
          rpId: new URL(options.config.expectedOrigin).hostname,
        });

        if (!result.ok) {
          return sendJson(response, 400, result);
        }

        const issued = sessionService.issue(result.did, result.keyId);
        setSessionCookie(response, issued.token, issued.session);
        return sendJson(response, 200, {
          ok: true,
          did: result.did,
          keyId: result.keyId,
          mode: result.mode,
          session: serializeSession(issued.session),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/session") {
        const token = readCookie(request, SESSION_COOKIE);
        const session = sessionService.get(token);
        return sendJson(response, 200, {
          ok: true,
          authenticated: Boolean(session),
          session: session ? serializeSession(session) : null,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/clear") {
        const token = readCookie(request, SESSION_COOKIE);
        const cleared = sessionService.clear(token);
        clearSessionCookie(response);
        return sendJson(response, 200, { ok: true, cleared });
      }

      if (request.method === "GET") {
        return await servePublic(response, publicDir, url.pathname);
      }

      response.setHeader("Allow", "GET, POST");
      return sendJson(response, 405, {
        ok: false,
        code: "method_not_allowed",
        message: "method is not supported by the demo server",
      });
    } catch (error) {
      return sendJson(response, error instanceof HttpError ? error.status : 500, {
        ok: false,
        code: error instanceof HttpError ? error.code : "internal_error",
        message: error instanceof Error ? error.message : "internal server error",
      });
    }
  });
}

export async function createDefaultDemoServer(): Promise<Server> {
  const config = await loadPassportPocConfig();
  const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
  return createDemoServer({ config, client });
}

function buildDemoMessage(
  config: PassportPocConfig,
  fields: {
    did: string;
    keyId: string;
    nonce: string;
    issuedAt: Date;
    expirationTime: Date;
  },
): string {
  const message: SiwdMessageFields = {
    domain: new URL(config.expectedOrigin).host,
    did: fields.did,
    statement: SIWD_STATEMENT,
    keyId: fields.keyId,
    uri: new URL("/login", config.expectedOrigin).toString(),
    version: "1",
    network: config.network,
    nonce: fields.nonce,
    issuedAt: fields.issuedAt.toISOString(),
    expirationTime: fields.expirationTime.toISOString(),
  };
  return buildSiwdMessage(message);
}

async function servePublic(
  response: ServerResponse,
  publicDir: string,
  requestPath: string,
): Promise<void> {
  const decodedPath = decodeURIComponent(requestPath);
  const pathName = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = join(publicDir, pathName);
  const relativePath = relative(publicDir, filePath);
  if (relativePath.startsWith("..") || relativePath === "") {
    return sendJson(response, 403, {
      ok: false,
      code: "static_path_forbidden",
      message: "static path is outside the public directory",
    });
  }

  try {
    await access(filePath);
  } catch {
    if (pathName === "/index.html") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("CKB Passport PoC demo server");
      return;
    }
    return sendJson(response, 404, {
      ok: false,
      code: "not_found",
      message: "resource was not found",
    });
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
  });
  createReadStream(filePath).pipe(response);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 1_000_000) {
      throw new HttpError(413, "payload_too_large", "request body is too large");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "json_invalid", "request body must be valid JSON");
  }
}

function requestUrl(request: IncomingMessage, expectedOrigin: string): URL {
  return new URL(request.url ?? "/", expectedOrigin);
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (!response.headersSent) {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  }
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function configPayload(config: PassportPocConfig): Record<string, unknown> {
  return {
    ok: true,
    network: config.network,
    expectedOrigin: config.expectedOrigin,
    rpId: new URL(config.expectedOrigin).hostname,
    didCodeHash: config.didCodeHash,
    didHashType: config.didHashType,
  };
}

function serializeSession(session: PassportSession): Record<string, string> {
  return {
    did: session.did,
    keyId: session.keyId,
    issuedAt: session.issuedAt.toISOString(),
    expirationTime: session.expirationTime.toISOString(),
  };
}

function setSessionCookie(
  response: ServerResponse,
  token: string,
  session: PassportSession,
): void {
  const maxAge = Math.max(
    0,
    Math.floor((session.expirationTime.getTime() - Date.now()) / 1000),
  );
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
}

function clearSessionCookie(response: ServerResponse): void {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

function readCookie(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }
  return undefined;
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number.parseInt(
    process.env.CKB_PASSPORT_DEMO_PORT ?? process.env.PORT ?? String(DEFAULT_PORT),
    10,
  );
  const listenPort = Number.isFinite(port) ? port : DEFAULT_PORT;

  createDefaultDemoServer()
    .then((server) => {
      server.listen(listenPort, "127.0.0.1", () => {
        console.log(`CKB Passport PoC demo listening at http://127.0.0.1:${listenPort}`);
      });
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

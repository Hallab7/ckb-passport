"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ConfigPayload = {
  ok: boolean;
  network: string;
  expectedOrigin: string;
  rpId: string;
  didCodeHash: string;
  didHashType: string;
  didUpdateInput: string;
  hasServerDidLockSigner: boolean;
  defaultDid: string;
  defaultKeyId: string;
  defaultFeeRateShannonsPerKw: string;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = { [key: string]: JsonValue };
type BusyAction =
  | "config"
  | "resolve"
  | "nonce"
  | "register"
  | "update"
  | "roundtrip"
  | "explorer"
  | "signin"
  | "replay"
  | "session"
  | "clear";

type ProofEnvelope = {
  v: 1;
  did: string;
  keyId: string;
  message: string;
  mode: "webauthn";
  signature: string;
  clientDataJSON: string;
  authenticatorData: string;
  credentialId?: string;
};

const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function PassportDemo() {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [did, setDid] = useState("did:ckb:o5bfnlw5t75w5bgvillbz3jzdwa2lxng");
  const [keyId, setKeyId] = useState("auth-1");
  const [didKey, setDidKey] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [didLockPrivateKey, setDidLockPrivateKey] = useState("");
  const [feeRateShannonsPerKw, setFeeRateShannonsPerKw] = useState("1000");
  const [feePaidShannons, setFeePaidShannons] = useState("");
  const [txHash, setTxHash] = useState("");
  const [capacityShannons, setCapacityShannons] = useState("");
  const [message, setMessage] = useState("");
  const [lastProof, setLastProof] = useState<ProofEnvelope | null>(null);
  const [browserOrigin, setBrowserOrigin] = useState("");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [copied, setCopied] = useState("");
  const [results, setResults] = useState<Record<string, JsonRecord>>({
    config: { ok: false, message: "Loading config" },
    resolver: { ok: false, message: "Not run" },
    nonce: { ok: false, message: "Not run" },
    passkey: { ok: false, message: "Not run" },
    update: { ok: false, message: "Not run" },
    roundtrip: { ok: false, message: "Not run" },
    explorer: { ok: false, message: "Not run" },
    verify: { ok: false, message: "Not run" },
    session: { ok: false, message: "Not run" },
  });

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
    void loadConfig();
    void refreshSession();
  }, []);

  const domainReady = useMemo(() => {
    if (!config || !browserOrigin) {
      return true;
    }
    return new URL(browserOrigin).hostname === config.rpId;
  }, [browserOrigin, config]);

  const expectedOriginUrl = config?.expectedOrigin ?? "http://localhost:3000";
  const explorerUrl = readString(results.explorer.updateTransactionUrl);
  const hasUsableDidKey = didKey.startsWith("did:key:zDna");
  const hasTxHash = /^0x[0-9a-fA-F]{64}$/.test(txHash);

  const steps = [
    {
      label: "Resolve DID",
      detail: "Live testnet cell",
      state: resultState(results.resolver),
    },
    {
      label: "Register Passkey",
      detail: "Create did:key",
      state: hasUsableDidKey ? "pass" : resultState(results.passkey),
    },
    {
      label: "Write DID",
      detail: "Submit update tx",
      state: hasTxHash ? "pass" : resultState(results.update),
    },
    {
      label: "Round Trip",
      detail: "Read auth-1 back",
      state: resultState(results.roundtrip),
    },
    {
      label: "Explorer",
      detail: "Evidence link",
      state: explorerUrl ? "pass" : resultState(results.explorer),
    },
    {
      label: "Sign In",
      detail: "Passkey proof",
      state: resultState(results.verify),
    },
    {
      label: "Replay Check",
      detail: "Nonce consumed",
      state:
        readString(results.verify.code) === "nonce_consumed"
          ? "pass"
          : "idle",
    },
  ];

  async function loadConfig() {
    await run("config", async () => {
      const body = await getJson("/api/config");
      setResults((current) => ({ ...current, config: body }));
      if (body.ok) {
        setConfig(body as unknown as ConfigPayload);
        setDid(readString(body.defaultDid) || did);
        setKeyId(readString(body.defaultKeyId) || keyId);
        setFeeRateShannonsPerKw(
          readString(body.defaultFeeRateShannonsPerKw) || feeRateShannonsPerKw,
        );
      }
    });
  }

  async function resolveDid() {
    await run("resolve", async () => {
      const body = await postJson("/api/did/resolve", { did });
      setResults((current) => ({ ...current, resolver: body }));
    });
  }

  async function requestNonce() {
    await run("nonce", async () => {
      const body = await getJson(
        `/api/nonce?did=${encodeURIComponent(did)}&keyId=${encodeURIComponent(keyId)}`,
      );
      setResults((current) => ({ ...current, nonce: body }));
      const nextMessage = readString(body.message);
      if (nextMessage) {
        setMessage(nextMessage);
      }
    });
  }

  async function registerPasskey() {
    await run("register", async () => {
      requireWebAuthn(config, domainReady);
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomBuffer(32),
          rp: {
            id: config.rpId,
            name: "CKB Passport PoC",
          },
          user: {
            id: randomBuffer(16),
            name: did,
            displayName: keyId,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred",
          },
          timeout: 60_000,
          attestation: "direct",
        },
      })) as PublicKeyCredential | null;

      if (!credential || credential.type !== "public-key") {
        throw new Error("Passkey registration returned no public-key credential");
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const attestationObject = bytesToBase64Url(
        new Uint8Array(response.attestationObject),
      );
      const converted = await postJson("/api/passkey/did-key", { attestationObject });
      const nextDidKey = readString(converted.didKey);
      if (converted.ok && nextDidKey) {
        setCredentialId(bytesToBase64Url(new Uint8Array(credential.rawId)));
        setDidKey(nextDidKey);
      }
      setResults((current) => ({ ...current, passkey: converted }));
    });
  }

  async function updateDid() {
    await run("update", async () => {
      const body = await postJson("/api/did/update", {
        did,
        keyId,
        didKey,
        didLockPrivateKey,
        feeRate: feeRateShannonsPerKw,
      });
      if (body.ok) {
        setDidLockPrivateKey("");
        setTxHash(readString(body.txHash));
        setCapacityShannons(readString(body.capacityShannons));
        setFeeRateShannonsPerKw(
          readString(body.feeRateShannonsPerKw) || feeRateShannonsPerKw,
        );
        setFeePaidShannons(readString(body.feePaidShannons));
      }
      setResults((current) => ({ ...current, update: body }));
    });
  }

  async function checkRoundTrip() {
    await run("roundtrip", async () => {
      const body = await postJson("/api/did/roundtrip", { did, keyId, didKey });
      setResults((current) => ({ ...current, roundtrip: body }));
    });
  }

  async function createExplorerEvidence() {
    await run("explorer", async () => {
      const body = await postJson("/api/evidence/explorer", {
        did,
        keyId,
        didKey,
        txHash,
        capacityShannons,
      });
      setResults((current) => ({ ...current, explorer: body }));
    });
  }

  async function signInWithPasskey() {
    await run("signin", async () => {
      requireWebAuthn(config, domainReady);
      if (!message) {
        throw new Error("Request a nonce before signing in");
      }
      const requestOptions: PublicKeyCredentialRequestOptions = {
        challenge: await sha256(message),
        rpId: config.rpId,
        userVerification: "preferred",
      };
      if (credentialId) {
        requestOptions.allowCredentials = [
          {
            type: "public-key",
            id: base64UrlToBuffer(credentialId),
          },
        ];
      }

      const credential = (await navigator.credentials.get({
        publicKey: requestOptions,
      })) as PublicKeyCredential | null;
      if (!credential || credential.type !== "public-key") {
        throw new Error("Passkey assertion returned no public-key credential");
      }

      const response = credential.response as AuthenticatorAssertionResponse;
      const rawSignature = derEcdsaSignatureToRaw(new Uint8Array(response.signature));
      const proof: ProofEnvelope = {
        v: 1,
        did,
        keyId,
        message,
        mode: "webauthn",
        signature: bytesToBase64Url(normalizeRawSignature(rawSignature, P256_N)),
        clientDataJSON: bytesToBase64Url(new Uint8Array(response.clientDataJSON)),
        authenticatorData: bytesToBase64Url(new Uint8Array(response.authenticatorData)),
        credentialId: credential.id,
      };
      setLastProof(proof);
      const body = await postJson("/api/verify", { proof });
      setResults((current) => ({ ...current, verify: body }));
      await refreshSession();
    });
  }

  async function replayLastProof() {
    await run("replay", async () => {
      if (!lastProof) {
        throw new Error("No proof has been submitted");
      }
      const body = await postJson("/api/verify", { proof: lastProof });
      setResults((current) => ({ ...current, verify: body }));
      await refreshSession();
    });
  }

  async function refreshSession() {
    await run("session", async () => {
      const body = await getJson("/api/session");
      setResults((current) => ({ ...current, session: body }));
    });
  }

  async function clearCurrentSession() {
    await run("clear", async () => {
      const body = await postJson("/api/session/clear", {});
      setResults((current) => ({ ...current, session: body }));
      setLastProof(null);
    });
  }

  async function copyValue(label: string, value: string) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  async function run(action: BusyAction, fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
    } catch (error) {
      const body = normalizeError(error);
      const target =
        action === "register"
          ? "passkey"
          : action === "update"
            ? "update"
            : action === "roundtrip"
              ? "roundtrip"
              : action === "explorer"
                ? "explorer"
                : action === "resolve"
                  ? "resolver"
                  : action === "config"
                    ? "config"
                    : action === "session" || action === "clear"
                      ? "session"
                      : "verify";
      setResults((current) => ({ ...current, [target]: body }));
    } finally {
      setBusy((current) => (current === action ? null : current));
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <div className="brand-row">
            <span className="brand-mark">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <span>CKB Passport PoC</span>
          </div>
          <h1>Guided DID sign-in demo</h1>
          <div className="config-strip">
            <StatusBadge label={config?.network ?? "loading"} state={config ? "pass" : "idle"} />
            <StatusBadge label={config?.rpId ?? "rp"} state={domainReady ? "pass" : "blocked"} />
            <StatusBadge label="testnet only" state="pass" />
          </div>
        </div>
        <div className="top-actions">
          <ActionButton
            icon={<RefreshCw size={16} />}
            label="Reload Config"
            title="Reload config"
            busy={busy === "config"}
            onClick={loadConfig}
            variant="secondary"
          />
          <ActionButton
            icon={<RefreshCw size={16} />}
            label="Session"
            title="Refresh session"
            busy={busy === "session"}
            onClick={refreshSession}
            variant="secondary"
          />
          <ActionButton
            icon={<Trash2 size={16} />}
            label="Clear"
            title="Clear session"
            busy={busy === "clear"}
            onClick={clearCurrentSession}
            variant="danger"
          />
        </div>
      </section>

      {!domainReady ? (
        <section className="domain-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Open the configured origin before using passkeys.</strong>
            <a href={expectedOriginUrl}>{expectedOriginUrl}</a>
          </div>
        </section>
      ) : null}

      <section className="workspace-grid">
        <aside className="run-order" aria-label="Run order">
          <div className="section-heading">
            <span>Run Order</span>
          </div>
          <ol>
            {steps.map((step, index) => (
              <li key={step.label} className={`step-row ${step.state}`}>
                <span className="step-index">{index + 1}</span>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </aside>

        <section className="work-surface">
          <Panel
            eyebrow="Identity"
            title="Resolve the testnet DID"
            result={results.resolver}
            actions={
              <>
                <ActionButton
                  icon={<Link2 size={16} />}
                  label="Resolve DID"
                  title="Resolve DID"
                  busy={busy === "resolve"}
                  onClick={resolveDid}
                />
                <ActionButton
                  icon={<KeyRound size={16} />}
                  label="Nonce"
                  title="Request nonce"
                  busy={busy === "nonce"}
                  onClick={requestNonce}
                  variant="secondary"
                />
              </>
            }
          >
            <div className="field-grid two">
              <TextField label="DID" value={did} onChange={setDid} mono />
              <TextField label="Key ID" value={keyId} onChange={setKeyId} mono />
            </div>
            <label className="text-label">
              <span>Canonical SIWD Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                spellCheck={false}
                rows={9}
              />
            </label>
            <ResultBlock title="Nonce" value={results.nonce} />
          </Panel>

          <Panel
            eyebrow="Registration"
            title="Create the passkey DID key"
            result={results.passkey}
            actions={
              <ActionButton
                icon={<Fingerprint size={16} />}
                label="Register Passkey"
                title="Register passkey"
                busy={busy === "register"}
                onClick={registerPasskey}
                disabled={!domainReady}
              />
            }
          >
            <div className="field-grid two">
              <ValueField
                label="Credential ID"
                value={credentialId}
                onCopy={() => copyValue("credential", credentialId)}
                copied={copied === "credential"}
              />
              <ValueField
                label="Passkey did:key"
                value={didKey}
                onChange={setDidKey}
                onCopy={() => copyValue("didKey", didKey)}
                copied={copied === "didKey"}
              />
            </div>
          </Panel>

          <Panel
            eyebrow="DID Update"
            title="Write auth-1 to the DID document"
            result={results.update}
            actions={
              <>
                <ActionButton
                  icon={<Send size={16} />}
                  label="Submit Update"
                  title="Submit DID update"
                  busy={busy === "update"}
                  onClick={updateDid}
                  disabled={!hasUsableDidKey}
                />
                <ActionButton
                  icon={<RefreshCw size={16} />}
                  label="Round Trip"
                  title="Check DID round trip"
                  busy={busy === "roundtrip"}
                  onClick={checkRoundTrip}
                  disabled={!hasUsableDidKey}
                  variant="secondary"
                />
              </>
            }
          >
            <div className="field-grid two">
              <SecretField
                label="DID controller private key"
                value={didLockPrivateKey}
                onChange={setDidLockPrivateKey}
              />
              <TextField
                label="Fee rate shannons/KW"
                value={feeRateShannonsPerKw}
                onChange={setFeeRateShannonsPerKw}
                mono
              />
            </div>
            <div className="field-grid two">
              <TextField
                label="Capacity shannons"
                value={capacityShannons}
                onChange={setCapacityShannons}
                mono
              />
              <TextField
                label="Fee paid shannons"
                value={feePaidShannons}
                onChange={setFeePaidShannons}
                mono
              />
            </div>
            <div className="field-grid one">
              <ValueField
                label="Update transaction hash"
                value={txHash}
                onChange={setTxHash}
                onCopy={() => copyValue("txHash", txHash)}
                copied={copied === "txHash"}
              />
            </div>
          </Panel>

          <Panel
            eyebrow="Explorer"
            title="Create explorer evidence"
            result={results.explorer}
            actions={
              <>
                <ActionButton
                  icon={<ExternalLink size={16} />}
                  label="Build Evidence"
                  title="Build explorer evidence"
                  busy={busy === "explorer"}
                  onClick={createExplorerEvidence}
                  disabled={!hasUsableDidKey || !hasTxHash}
                />
                {explorerUrl ? (
                  <a className="link-button" href={explorerUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} aria-hidden="true" />
                    Open Explorer
                  </a>
                ) : null}
              </>
            }
          >
            <ResultBlock title="Round-trip result" value={results.roundtrip} />
          </Panel>

          <Panel
            eyebrow="Authentication"
            title="Sign in and prove replay rejection"
            result={results.verify}
            actions={
              <>
                <ActionButton
                  icon={<Fingerprint size={16} />}
                  label="Sign In"
                  title="Sign in with passkey"
                  busy={busy === "signin"}
                  onClick={signInWithPasskey}
                  disabled={!domainReady || !message || !hasUsableDidKey}
                />
                <ActionButton
                  icon={<RotateCcw size={16} />}
                  label="Replay"
                  title="Replay last proof"
                  busy={busy === "replay"}
                  onClick={replayLastProof}
                  disabled={!lastProof}
                  variant="danger"
                />
              </>
            }
          >
            <ResultBlock title="Session" value={results.session} />
          </Panel>

          <section className="evidence-ledger">
            <div className="section-heading">
              <span>Evidence Values</span>
            </div>
            <div className="ledger-grid">
              <LedgerItem label="CKB_PASSPORT_LIVE_DID" value={did} />
              <LedgerItem label="CKB_PASSPORT_AUTH_KEY_ID" value={keyId} />
              <LedgerItem label="CKB_PASSPORT_AUTH_DID_KEY" value={didKey || "pending"} />
              <LedgerItem label="CKB_PASSPORT_UPDATE_TX_HASH" value={txHash || "pending"} />
              <LedgerItem
                label="CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS"
                value={capacityShannons || "optional"}
              />
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  children,
  actions,
  result,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  result: JsonRecord;
}) {
  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="button-row">{actions}</div>
      </div>
      <div className="panel-body">{children}</div>
      <ResultBlock title="Result" value={result} />
    </article>
  );
}

function TextField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="text-label">
      <span>{label}</span>
      <input
        className={mono ? "mono" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-label">
      <span>{label}</span>
      <input
        className="mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        type="password"
        placeholder="0x..."
      />
    </label>
  );
}

function ValueField({
  label,
  value,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <label className="text-label value-field">
      <span>{label}</span>
      <span className="copy-shell">
        <input
          className="mono"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={!onChange}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          className="icon-button"
          onClick={onCopy}
          title={`Copy ${label}`}
          aria-label={`Copy ${label}`}
        >
          {copied ? <CheckCircle2 size={16} /> : <Clipboard size={16} />}
        </button>
      </span>
    </label>
  );
}

function ActionButton({
  icon,
  label,
  title,
  busy,
  disabled,
  onClick,
  variant = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      className={`action-button ${variant}`}
      onClick={() => void onClick()}
      disabled={busy || disabled}
      title={title}
    >
      {busy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : icon}
      <span>{label}</span>
    </button>
  );
}

function ResultBlock({ title, value }: { title: string; value: JsonRecord }) {
  return (
    <div className="result-block">
      <div className="result-title">{title}</div>
      <pre>{formatJson(value)}</pre>
    </div>
  );
}

function LedgerItem({ label, value }: { label: string; value: string }) {
  const isPending = value === "pending";
  return (
    <div className={`ledger-item ${isPending ? "pending" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({
  label,
  state,
}: {
  label: string;
  state: "idle" | "pass" | "blocked";
}) {
  return <span className={`status-badge ${state}`}>{label}</span>;
}

async function getJson(path: string): Promise<JsonRecord> {
  const response = await fetch(path);
  return parseApiResponse(response);
}

async function postJson(path: string, body: unknown): Promise<JsonRecord> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(response);
}

async function parseApiResponse(response: Response): Promise<JsonRecord> {
  const contentType = response.headers.get("content-type") ?? "";
  const body =
    contentType.includes("application/json")
      ? ((await response.json()) as JsonRecord)
      : ({ ok: false, message: await response.text() } satisfies JsonRecord);
  return {
    ...body,
    httpStatus: response.status,
  };
}

function requireWebAuthn(
  config: ConfigPayload | null,
  domainReady: boolean,
): asserts config is ConfigPayload {
  if (!globalThis.PublicKeyCredential || !navigator.credentials) {
    throw new Error("WebAuthn is unavailable in this browser context");
  }
  if (!config) {
    throw new Error("Server config is not loaded");
  }
  if (!domainReady) {
    throw new Error(`Open ${config.expectedOrigin} before using passkeys`);
  }
}

function normalizeError(error: unknown): JsonRecord {
  return {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

function formatJson(value: JsonRecord): string {
  return JSON.stringify(value, null, 2);
}

function resultState(value: JsonRecord): "idle" | "pass" | "blocked" {
  if (value.ok === true) {
    return "pass";
  }
  if (value.ok === false && readString(value.message) !== "Not run") {
    return "blocked";
  }
  return "idle";
}

function readString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function randomBuffer(length: number): ArrayBuffer {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  crypto.getRandomValues(bytes);
  return buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBuffer(input: string): ArrayBuffer {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function normalizeRawSignature(rawSignature: Uint8Array, order: bigint): Uint8Array {
  if (rawSignature.length !== 64) {
    throw new Error("Raw ECDSA signature must be 64 bytes");
  }
  const normalized = new Uint8Array(rawSignature);
  const s = bytesToBigInt(normalized.slice(32));
  if (s > order / 2n) {
    normalized.set(bigIntToScalar(order - s), 32);
  }
  return normalized;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function bigIntToScalar(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let rest = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return bytes;
}

function derEcdsaSignatureToRaw(signature: Uint8Array): Uint8Array {
  let offset = 0;
  if (readByte(signature, offset) !== 0x30) {
    throw new Error("DER signature must start with a sequence");
  }
  offset += 1;

  const sequence = readDerLength(signature, offset);
  offset = sequence.nextOffset;
  if (offset + sequence.length !== signature.length) {
    throw new Error("DER sequence length is invalid");
  }

  const r = readDerInteger(signature, offset);
  offset = r.nextOffset;
  const s = readDerInteger(signature, offset);
  offset = s.nextOffset;
  if (offset !== signature.length) {
    throw new Error("DER signature has trailing bytes");
  }

  const raw = new Uint8Array(64);
  raw.set(leftPadScalar(r.value), 0);
  raw.set(leftPadScalar(s.value), 32);
  return raw;
}

function readDerInteger(
  bytes: Uint8Array,
  offset: number,
): { value: Uint8Array; nextOffset: number } {
  if (readByte(bytes, offset) !== 0x02) {
    throw new Error("DER integer is missing");
  }
  const length = readDerLength(bytes, offset + 1);
  const start = length.nextOffset;
  const end = start + length.length;
  if (end > bytes.length || length.length === 0) {
    throw new Error("DER integer length is invalid");
  }
  return {
    value: bytes.slice(start, end),
    nextOffset: end,
  };
}

function readDerLength(
  bytes: Uint8Array,
  offset: number,
): { length: number; nextOffset: number } {
  const first = readByte(bytes, offset);
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }
  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 2) {
    throw new Error("DER length is invalid");
  }
  if (offset + 1 + lengthBytes > bytes.length) {
    throw new Error("DER length is truncated");
  }
  let length = 0;
  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }
  return { length, nextOffset: offset + 1 + lengthBytes };
}

function leftPadScalar(value: Uint8Array): Uint8Array {
  let scalar = value;
  while (scalar.length > 0 && scalar[0] === 0) {
    scalar = scalar.slice(1);
  }
  if (scalar.length > 32) {
    throw new Error("DER scalar is too large");
  }
  const padded = new Uint8Array(32);
  padded.set(scalar, 32 - scalar.length);
  return padded;
}

function readByte(bytes: Uint8Array, offset: number): number {
  if (offset >= bytes.length) {
    throw new Error("DER signature is truncated");
  }
  return bytes[offset];
}

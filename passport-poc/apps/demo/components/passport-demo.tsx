"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Fingerprint,
  FileText,
  History,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Wallet,
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
  | "wallet"
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

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function PassportDemo() {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [did, setDid] = useState("did:ckb:o5bfnlw5t75w5bgvillbz3jzdwa2lxng");
  const [keyId, setKeyId] = useState("auth-1");
  const [didKey, setDidKey] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [evmAccount, setEvmAccount] = useState("");
  const [evmChainId, setEvmChainId] = useState("");
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
  const resolverMethods = readRecord(results.resolver.verificationMethods);
  const resolvedDidKey = resolverMethods ? readString(resolverMethods[keyId]) : "";
  const explorerUrl = readString(results.explorer.updateTransactionUrl);
  const updateTxHash = readString(results.update.txHash);
  const evidenceTxHash = readString(results.explorer.updateTransactionHash);
  const displayDidKey = didKey || resolvedDidKey;
  const displayTxHash = txHash || updateTxHash || evidenceTxHash;
  const displayCapacityShannons =
    capacityShannons ||
    readString(results.update.capacityShannons) ||
    readString(results.resolver.capacityShannons);
  const displayFeePaidShannons =
    feePaidShannons || readString(results.update.feePaidShannons);
  const activeSession = readRecord(results.session.session);
  const authenticated = results.session.authenticated === true;
  const hasLocalDidKey = didKey.startsWith("did:key:zDna");
  const hasUsableDidKey = displayDidKey.startsWith("did:key:zDna");
  const hasTxHash = /^0x[0-9a-fA-F]{64}$/.test(displayTxHash);
  const replayRejected = readString(results.verify.code) === "nonce_consumed";
  const keyMatchLabel =
    resolvedDidKey && didKey
      ? resolvedDidKey === didKey
        ? "matching"
        : "different"
      : "not checked";
  const didStateLabel = results.resolver.ok === true ? "Live" : "Unresolved";
  const authKeyLabel = resolvedDidKey
    ? "On-chain"
    : hasLocalDidKey
      ? "Local"
      : "Pending";
  const updateStateLabel = hasTxHash ? "Committed" : "Pending";
  const replayStateLabel = replayRejected ? "Rejected" : "Unchecked";
  const capacityCkb = displayCapacityShannons
    ? `${formatCkb(displayCapacityShannons)} CKB`
    : "Pending";

  const steps = [
    {
      label: "Resolve DID",
      detail: "Live testnet cell",
      state: resultState(results.resolver),
    },
    {
      label: "Register Passkey",
      detail: "Create did:key",
      state: hasLocalDidKey ? "pass" : resultState(results.passkey),
    },
    {
      label: "Write DID",
      detail: "Submit update tx",
      state: hasTxHash ? "pass" : didUpdateState(results.update),
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
      state: replayRejected ? "pass" : "idle",
    },
  ];
  const completedStepCount = steps.filter((step) => step.state === "pass").length;
  const nextAction = getNextAction({
    domainReady,
    resolved: results.resolver.ok === true,
    didKeyReady: hasLocalDidKey,
    walletReady: Boolean(evmAccount),
    txReady: hasTxHash,
    roundTripReady: results.roundtrip.ok === true,
    explorerReady: Boolean(explorerUrl),
    nonceReady: Boolean(message),
    signedIn: results.verify.ok === true,
    replayChecked: replayRejected,
  });

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
      const verificationMethods = readRecord(body.verificationMethods);
      const resolvedDidKey = verificationMethods
        ? readString(verificationMethods[keyId])
        : "";
      const resolvedCapacityShannons = readString(body.capacityShannons);
      if (resolvedCapacityShannons && !capacityShannons) {
        setCapacityShannons(resolvedCapacityShannons);
      }
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
      const account = evmAccount || (await requestEvmWallet()).account;
      const prepared = await postJson("/api/did/wallet-update/prepare", {
        did,
        keyId,
        didKey: displayDidKey,
        evmAccount: account,
        feeRate: feeRateShannonsPerKw,
      });
      setResults((current) => ({ ...current, update: prepared }));
      if (!prepared.ok) {
        return;
      }

      const challengeId = readString(prepared.challengeId);
      const signingMessage = readString(prepared.signingMessage);
      if (!challengeId || !signingMessage) {
        throw new Error("Wallet signing challenge response is incomplete");
      }

      const signature = await signEvmMessage(account, signingMessage);
      const body = await postJson("/api/did/wallet-update/submit", {
        challengeId,
        evmAccount: account,
        signature,
      });
      if (body.ok) {
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

  async function connectEvmWallet() {
    await run("wallet", async () => {
      const { account, chainId } = await requestEvmWallet();
      setResults((current) => ({
        ...current,
        update: {
          ok: true,
          message: "EVM wallet connected",
          evmAccount: account,
          chainId,
        },
      }));
    });
  }

  async function checkRoundTrip() {
    await run("roundtrip", async () => {
      const body = await postJson("/api/did/roundtrip", {
        did,
        keyId,
        didKey: displayDidKey,
      });
      setResults((current) => ({ ...current, roundtrip: body }));
    });
  }

  async function createExplorerEvidence() {
    await run("explorer", async () => {
      const body = await postJson("/api/evidence/explorer", {
        did,
        keyId,
        didKey: displayDidKey,
        txHash: displayTxHash,
        capacityShannons: displayCapacityShannons,
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

  async function requestEvmWallet(): Promise<{ account: string; chainId: string }> {
    const provider = getEthereumProvider();
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const account = readFirstEvmAccount(accounts);
    const chainId = await readEvmChainId(provider);
    setEvmAccount(account);
    setEvmChainId(chainId);
    return { account, chainId };
  }

  async function signEvmMessage(
    account: string,
    signingMessage: string,
  ): Promise<string> {
    const provider = getEthereumProvider();
    const signature = await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(signingMessage), account],
    });
    if (typeof signature !== "string" || signature.trim().length === 0) {
      throw new Error("EVM wallet did not return a signature");
    }
    return signature;
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
          : action === "update" || action === "wallet"
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
      <section className="announcement-bar" aria-label="Demo environment">
        <span>Live testnet</span>
        <strong>{shortenMiddle(did, 18, 12)}</strong>
        <span>{config?.didUpdateInput ?? "loading"}</span>
      </section>

      <header className="top-nav">
        <a className="nav-brand" href="#identity">
          <span className="brand-mark">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span>Passport</span>
        </a>
        <nav className="nav-links" aria-label="Demo sections">
          <a href="#resolve">Resolve</a>
          <a href="#register">Register</a>
          <a href="#update">Update</a>
          <a href="#signin">Sign In</a>
          <a href="#trust">Trust</a>
        </nav>
        <div className="nav-actions">
          <ActionButton
            icon={<RefreshCw size={16} />}
            label="Config"
            title="Reload config"
            busy={busy === "config"}
            onClick={loadConfig}
            variant="secondary"
          />
          <ActionButton
            icon={<Server size={16} />}
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
      </header>

      {!domainReady ? (
        <section className="domain-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Configured origin required for passkeys.</strong>
            <a href={expectedOriginUrl}>{expectedOriginUrl}</a>
          </div>
        </section>
      ) : null}

      <section className="registry-hero">
        <div className="hero-copy">
          <div className="section-heading">
            {`REGISTRY / PASSPORT DEMO / ${(config?.network ?? "LOADING").toUpperCase()}`}
          </div>
          <h1>
            <span>Proof without</span>
            <span>wallet sign-in.</span>
          </h1>
          <p className="hero-description">
            Resolve the live DID, publish auth-1, and verify the passkey session
            from one browser console.
          </p>
          <div className="hero-ctas">
            <ActionButton
              icon={<Link2 size={16} />}
              label="Resolve DID"
              title="Resolve DID"
              busy={busy === "resolve"}
              onClick={resolveDid}
            />
            <ActionButton
              icon={<Fingerprint size={16} />}
              label="Register"
              title="Register passkey"
              busy={busy === "register"}
              onClick={registerPasskey}
              disabled={!domainReady}
              variant="secondary"
            />
          </div>
        </div>

        <aside className="market-snapshot" aria-label="Live DID snapshot">
          <div className="snapshot-head">
            <span>Live Snapshot</span>
            <StatusBadge
              label={results.resolver.ok === true ? "live" : "pending"}
              state={resultState(results.resolver)}
            />
          </div>
          <div className="snapshot-balance">
            <span>Remaining capacity</span>
            <strong>{capacityCkb}</strong>
          </div>
          <div className="snapshot-grid">
            <SnapshotItem label="DID state" value={didStateLabel} />
            <SnapshotItem label="Auth key" value={authKeyLabel} />
            <SnapshotItem label="Update" value={updateStateLabel} />
            <SnapshotItem label="Replay" value={replayStateLabel} />
          </div>
          <div className="signal-chart" aria-hidden="true">
            <span style={{ height: "32%" }} />
            <span style={{ height: "64%" }} />
            <span style={{ height: "46%" }} />
            <span style={{ height: "78%" }} />
            <span style={{ height: "58%" }} />
            <span style={{ height: "88%" }} />
            <span style={{ height: "70%" }} />
            <span style={{ height: "100%" }} />
          </div>
        </aside>
      </section>

      <section className="metrics-strip" aria-label="Live metrics">
        <MetricTile label="DID State" value={didStateLabel} />
        <MetricTile label="Auth Key" value={authKeyLabel} />
        <MetricTile label="Update Tx" value={displayTxHash ? shortenMiddle(displayTxHash, 6, 6) : "Pending"} />
        <MetricTile label="Replay" value={replayStateLabel} />
      </section>

      <section className="feature-editorial">
        <div>
          <span className="section-heading">Feature Editorial</span>
          <h2>Every proof value is visible before the next action.</h2>
        </div>
        <div className="editorial-copy">
          <DataRow
            label="Current task"
            value={nextAction}
          />
          <DataRow
            label="Verified path"
            value="DID cell, auth-1 key, nonce, passkey signature, replay guard"
          />
          <DataRow
            label="Network"
            value={config?.network ?? "loading"}
          />
        </div>
      </section>

      <section className="product-showcase" id="product">
        <div className="showcase-head">
          <div>
            <span className="section-heading">Product Showcase</span>
            <h2>Live relying-party console</h2>
          </div>
          <StatusBadge
            label={`${completedStepCount}/${steps.length} complete`}
            state={completedStepCount === steps.length ? "pass" : "idle"}
          />
        </div>

        <section className="dashboard-layout">
          <section className="main-stack">
          <article className="identity-card" id="identity">
            <div className="card-head">
              <div>
                <span className="eyebrow">CKB / DID Passport / Testnet</span>
                <h2>Identity snapshot</h2>
              </div>
              <StatusBadge
                label={results.resolver.ok === true ? "live" : "unresolved"}
                state={resultState(results.resolver)}
              />
            </div>

            <div className="identifier-panel">
              <div className="identifier-mark">CKB</div>
              <div className="identifier-content">
                <span>Your identifier</span>
                <strong>{did}</strong>
                <small>
                  {displayTxHash
                    ? `TX ${shortenMiddle(displayTxHash).toUpperCase()} / CAPACITY ${formatCkb(displayCapacityShannons)} CKB`
                    : `RP ${config?.rpId ?? "loading"} / ${config?.network ?? "testnet"}`}
                </small>
              </div>
            </div>

            <div className="identity-actions">
              <ActionButton
                icon={<Clipboard size={16} />}
                label="Copy DID"
                title="Copy DID"
                busy={false}
                onClick={() => copyValue("did", did)}
                variant="secondary"
              />
              {explorerUrl ? (
                <a className="link-button" href={explorerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} aria-hidden="true" />
                  Explorer
                </a>
              ) : null}
            </div>

            <div className="data-grid">
              <DataRow label="Key ID" value={keyId} mono />
              <DataRow
                label="Current auth-1"
                value={resolvedDidKey || "pending"}
                mono
              />
              <DataRow
                label="Wallet"
                value={evmAccount || "not connected"}
                mono={Boolean(evmAccount)}
              />
              <DataRow
                label="Update transaction"
                value={displayTxHash || "pending"}
                mono={Boolean(displayTxHash)}
              />
            </div>
          </article>

          <div className="overview-grid">
            <DashboardCard
              eyebrow="Document"
              title="DID document"
              icon={<FileText size={18} aria-hidden="true" />}
              status={
                <StatusBadge
                  label={resolvedDidKey ? "resolved" : "waiting"}
                  state={resolvedDidKey ? "pass" : "idle"}
                />
              }
            >
              <DataRow label="Resolved auth-1" value={resolvedDidKey || "run resolve"} mono />
              <DataRow label="Local passkey" value={didKey || "register or paste key"} mono />
              <DataRow label="Key match" value={keyMatchLabel} />
              <DataRow
                label="Round trip"
                value={results.roundtrip.ok === true ? "matching" : "not checked"}
              />
            </DashboardCard>

            <DashboardCard
              eyebrow="Key material"
              title="OmniLock wallet"
              icon={<LockKeyhole size={18} aria-hidden="true" />}
              status={
                <StatusBadge
                  label={evmAccount ? "connected" : "waiting"}
                  state={evmAccount ? "pass" : "idle"}
                />
              }
            >
              <DataRow label="Update mode" value={config?.didUpdateInput ?? "loading"} />
              <DataRow label="EVM account" value={evmAccount || "not connected"} mono />
              <DataRow label="Chain ID" value={evmChainId || "not connected"} mono />
            </DashboardCard>

            <DashboardCard
              eyebrow="Evidence"
              title="Explorer proof"
              icon={<Terminal size={18} aria-hidden="true" />}
              status={
                <StatusBadge
                  label={explorerUrl ? "ready" : "pending"}
                  state={explorerUrl ? "pass" : "idle"}
                />
              }
            >
              <DataRow label="Tx hash" value={displayTxHash || "pending"} mono />
              <DataRow
                label="Capacity"
                value={
                  displayCapacityShannons
                    ? `${displayCapacityShannons} shannons`
                    : "pending"
                }
                mono={Boolean(displayCapacityShannons)}
              />
              <DataRow
                label="Fee paid"
                value={
                  displayFeePaidShannons
                    ? `${displayFeePaidShannons} shannons`
                    : "pending"
                }
                mono={Boolean(displayFeePaidShannons)}
              />
            </DashboardCard>

            <DashboardCard
              eyebrow="Session"
              title="Passkey sign-in"
              icon={<Server size={18} aria-hidden="true" />}
              status={
                <StatusBadge
                  label={authenticated ? "active" : "unsigned"}
                  state={authenticated ? "pass" : "idle"}
                />
              }
            >
              <DataRow label="Session DID" value={readString(activeSession?.did) || "none"} mono />
              <DataRow label="Session key" value={readString(activeSession?.keyId) || "none"} mono />
              <DataRow
                label="Replay"
                value={
                  readString(results.verify.code) === "nonce_consumed"
                    ? "rejected"
                    : "not checked"
                }
              />
            </DashboardCard>
          </div>

          <section className="operations">
            <div className="section-heading">Workflow / Live Check</div>

            <div id="resolve">
              <Panel
                eyebrow="Identity"
                title="Resolve DID and request nonce"
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
            </div>

            <div id="register">
              <Panel
                eyebrow="Registration"
                title="Create passkey DID key"
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
            </div>

            <div id="update">
              <Panel
                eyebrow="DID Update"
                title="Write auth-1 to the DID document"
                result={results.update}
                actions={
                  <>
                    <ActionButton
                      icon={<Wallet size={16} />}
                      label="Connect Wallet"
                      title="Connect EVM wallet"
                      busy={busy === "wallet"}
                      onClick={connectEvmWallet}
                      variant="secondary"
                    />
                    <ActionButton
                      icon={<Send size={16} />}
                      label="Submit"
                      title="Submit DID update with EVM wallet"
                      busy={busy === "update"}
                      onClick={updateDid}
                      disabled={!hasLocalDidKey || !evmAccount}
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
                  <ValueField
                    label="OmniLock EVM wallet"
                    value={evmAccount}
                    onCopy={() => copyValue("evmAccount", evmAccount)}
                    copied={copied === "evmAccount"}
                  />
                  <TextField
                    label="Fee rate shannons/KW"
                    value={feeRateShannonsPerKw}
                    onChange={setFeeRateShannonsPerKw}
                    mono
                  />
                </div>
                <div className="field-grid one">
                  <ValueField
                    label="EVM chain ID"
                    value={evmChainId}
                    onCopy={() => copyValue("evmChainId", evmChainId)}
                    copied={copied === "evmChainId"}
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
            </div>

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

            <div id="signin">
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
            </div>
          </section>
        </section>

        <aside className="side-stack" aria-label="Demo status">
          <section className="run-order" aria-label="Run order">
            <div className="section-heading">Run Order</div>
            <ol>
              {steps.map((step, index) => (
                <li key={step.label} className={`step-row ${step.state}`}>
                  <span className="step-index">{index + 1}</span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </span>
                  {step.state === "idle" ? (
                    <ArrowRight size={15} aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="activity-card">
            <div className="card-head compact">
              <div>
                <span className="eyebrow">Section / Activity</span>
                <h2>Operation history</h2>
              </div>
              <History size={18} aria-hidden="true" />
            </div>
            <ActivityRow
              label="Resolve"
              detail={results.resolver.ok === true ? "DID document loaded" : "Awaiting resolve"}
              state={resultState(results.resolver)}
            />
            <ActivityRow
              label="Update"
              detail={displayTxHash ? shortenMiddle(displayTxHash) : "No transaction yet"}
              state={hasTxHash ? "pass" : didUpdateState(results.update)}
            />
            <ActivityRow
              label="Round trip"
              detail={results.roundtrip.ok === true ? "auth-1 matched" : "Not checked"}
              state={resultState(results.roundtrip)}
            />
            <ActivityRow
              label="Sign in"
              detail={authenticated ? "DID-only session active" : "No active session"}
              state={authenticated ? "pass" : resultState(results.verify)}
            />
          </section>

          <section className="evidence-ledger">
            <div className="section-heading">Evidence Values</div>
            <div className="ledger-grid">
              <LedgerItem label="CKB_PASSPORT_LIVE_DID" value={did} />
              <LedgerItem label="CKB_PASSPORT_AUTH_KEY_ID" value={keyId} />
              <LedgerItem
                label="CKB_PASSPORT_AUTH_DID_KEY"
                value={displayDidKey || "pending"}
              />
              <LedgerItem
                label="CKB_PASSPORT_UPDATE_TX_HASH"
                value={displayTxHash || "pending"}
              />
              <LedgerItem
                label="CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS"
                value={displayCapacityShannons || "optional"}
              />
            </div>
          </section>
        </aside>
      </section>
      </section>

      <section className="trust-section" id="trust">
        <div>
          <span className="section-heading">Trust Section</span>
          <h2>Proof boundaries</h2>
        </div>
        <div className="trust-grid">
          <TrustItem label="Network" value={config?.network ?? "loading"} />
          <TrustItem label="Credential" value="WebAuthn P-256" />
          <TrustItem label="DID update" value={config?.didUpdateInput ?? "loading"} />
          <TrustItem label="Replay guard" value={replayStateLabel} />
        </div>
      </section>

      <footer className="site-footer">
        <span>CKB Passport PoC</span>
        <span>{did}</span>
      </footer>
    </main>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="snapshot-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrustItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="trust-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardCard({
  eyebrow,
  title,
  icon,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="dashboard-card">
      <div className="card-head compact">
        <div className="card-title">
          <span className="card-icon">{icon}</span>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {status}
      </div>
      <div className="data-list">{children}</div>
    </article>
  );
}

function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </div>
  );
}

function ActivityRow({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: "idle" | "pass" | "blocked";
}) {
  return (
    <div className={`activity-row ${state}`}>
      <span className="activity-dot" />
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
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

function didUpdateState(value: JsonRecord): "idle" | "pass" | "blocked" {
  if (readString(value.txHash)) {
    return "pass";
  }
  if (value.ok === true) {
    return "idle";
  }
  return resultState(value);
}

function getNextAction({
  domainReady,
  resolved,
  didKeyReady,
  walletReady,
  txReady,
  roundTripReady,
  explorerReady,
  nonceReady,
  signedIn,
  replayChecked,
}: {
  domainReady: boolean;
  resolved: boolean;
  didKeyReady: boolean;
  walletReady: boolean;
  txReady: boolean;
  roundTripReady: boolean;
  explorerReady: boolean;
  nonceReady: boolean;
  signedIn: boolean;
  replayChecked: boolean;
}): string {
  if (!domainReady) {
    return "Open origin";
  }
  if (!resolved) {
    return "Resolve DID";
  }
  if (!didKeyReady) {
    return "Register key";
  }
  if (!walletReady) {
    return "Connect wallet";
  }
  if (!txReady) {
    return "Submit update";
  }
  if (!roundTripReady) {
    return "Round trip";
  }
  if (!explorerReady) {
    return "Build evidence";
  }
  if (!nonceReady) {
    return "Request nonce";
  }
  if (!signedIn) {
    return "Sign in";
  }
  if (!replayChecked) {
    return "Replay proof";
  }
  return "Complete";
}

function readString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function readRecord(value: JsonValue | undefined): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function shortenMiddle(value: string, start = 10, end = 10): string {
  if (value.length <= start + end + 1) {
    return value;
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatCkb(shannons: string): string {
  if (!/^\d+$/.test(shannons)) {
    return "pending";
  }
  const value = BigInt(shannons);
  const whole = value / 100_000_000n;
  const fraction = (value % 100_000_000n).toString().padStart(8, "0");
  const trimmedFraction = fraction.replace(/0+$/, "") || "0";
  return `${whole}.${trimmedFraction}`;
}

function getEthereumProvider(): EthereumProvider {
  if (!window.ethereum) {
    throw new Error("No injected EVM wallet was found in this browser");
  }
  return window.ethereum;
}

function readFirstEvmAccount(accounts: unknown): string {
  if (!Array.isArray(accounts)) {
    throw new Error("EVM wallet did not return an account list");
  }
  const account = accounts.find(
    (value): value is string =>
      typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
  );
  if (!account) {
    throw new Error("EVM wallet returned no usable account");
  }
  return account;
}

async function readEvmChainId(provider: EthereumProvider): Promise<string> {
  try {
    const chainId = await provider.request({ method: "eth_chainId" });
    return typeof chainId === "string" ? chainId : "";
  } catch {
    return "";
  }
}

function utf8ToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
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

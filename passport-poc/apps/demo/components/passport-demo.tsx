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
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
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
type ControlStatus = {
  label: string;
  state: "idle" | "pass" | "blocked";
};

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
const INITIAL_KEY_ID = "auth-1";
const INITIAL_FEE_RATE_SHANNONS_PER_KW = "1000";

function initialResults(): Record<string, JsonRecord> {
  return {
    config: { ok: false, message: "Loading config" },
    resolver: { ok: false, message: "Not run" },
    nonce: { ok: false, message: "Not run" },
    passkey: { ok: false, message: "Not run" },
    update: { ok: false, message: "Not run" },
    roundtrip: { ok: false, message: "Not run" },
    explorer: { ok: false, message: "Not run" },
    verify: { ok: false, message: "Not run" },
    session: { ok: false, message: "Not run" },
  };
}

export function PassportDemo() {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [did, setDid] = useState("");
  const [keyId, setKeyId] = useState(INITIAL_KEY_ID);
  const [didKey, setDidKey] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [evmAccount, setEvmAccount] = useState("");
  const [evmChainId, setEvmChainId] = useState("");
  const [feeRateShannonsPerKw, setFeeRateShannonsPerKw] = useState(
    INITIAL_FEE_RATE_SHANNONS_PER_KW,
  );
  const [feePaidShannons, setFeePaidShannons] = useState("");
  const [txHash, setTxHash] = useState("");
  const [capacityShannons, setCapacityShannons] = useState("");
  const [message, setMessage] = useState("");
  const [lastProof, setLastProof] = useState<ProofEnvelope | null>(null);
  const [browserOrigin, setBrowserOrigin] = useState("");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [copied, setCopied] = useState("");
  const [controlStatus, setControlStatus] = useState<ControlStatus>({
    label: "Ready",
    state: "idle",
  });
  const [results, setResults] = useState<Record<string, JsonRecord>>(initialResults);

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
  const trimmedDid = did.trim();
  const hasDidInput = trimmedDid.length > 0;
  const resolverMethods = readRecord(results.resolver.verificationMethods);
  const resolvedDidKey = resolverMethods ? readString(resolverMethods[keyId]) : "";
  const resolvedDid = readString(results.resolver.did);
  const hasResolvedDid =
    hasDidInput && results.resolver.ok === true && resolvedDid === trimmedDid;
  const explorerUrl = readString(results.explorer.updateTransactionUrl);
  const updateTxHash = readString(results.update.txHash);
  const evidenceTxHash = readString(results.explorer.updateTransactionHash);
  const displayDidKey = didKey || resolvedDidKey;
  const displayTxHash = txHash || updateTxHash || evidenceTxHash;
  const displayCapacityShannons =
    capacityShannons ||
    readString(results.update.capacityShannons) ||
    readString(results.resolver.capacityShannons);
  const hasLocalDidKey = didKey.startsWith("did:key:zDna");
  const hasUsableDidKey = displayDidKey.startsWith("did:key:zDna");
  const hasTxHash = /^0x[0-9a-fA-F]{64}$/.test(displayTxHash);
  const replayRejected = readString(results.verify.code) === "nonce_consumed";
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

  async function loadConfig() {
    await run("config", async () => {
      const body = await getJson("/api/config");
      setResults((current) => ({ ...current, config: body }));
      if (body.ok) {
        setConfig(body as unknown as ConfigPayload);
        setKeyId(readString(body.defaultKeyId) || keyId);
        setFeeRateShannonsPerKw(
          readString(body.defaultFeeRateShannonsPerKw) || feeRateShannonsPerKw,
        );
      }
    });
  }

  async function resolveDid() {
    if (!hasDidInput) {
      return;
    }
    await run("resolve", async () => {
      const body = await postJson("/api/did/resolve", { did: trimmedDid });
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
    if (!hasResolvedDid) {
      return;
    }
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
            name: keyId,
            displayName: `CKB Passport ${keyId}`,
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
      resetDemoState();
    });
  }

  function resetDemoState() {
    setDid("");
    setKeyId(config?.defaultKeyId || INITIAL_KEY_ID);
    setDidKey("");
    setCredentialId("");
    setEvmAccount("");
    setEvmChainId("");
    setFeeRateShannonsPerKw(
      config?.defaultFeeRateShannonsPerKw || INITIAL_FEE_RATE_SHANNONS_PER_KW,
    );
    setFeePaidShannons("");
    setTxHash("");
    setCapacityShannons("");
    setMessage("");
    setLastProof(null);
    setCopied("");
    setResults(initialResults());
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
      if (action === "clear") {
        resetDemoState();
        setControlStatus({
          label: `Clear failed: ${readString(body.message) || "Unknown error"}`,
          state: "blocked",
        });
      }
    } finally {
      setBusy((current) => (current === action ? null : current));
    }
  }

  return (
    <main className="app-shell">
      {/* <section className="announcement-bar" aria-label="Demo environment">
        <span>Live testnet</span>
        <strong>{shortenMiddle(did, 18, 12)}</strong>
        <span>{config?.didUpdateInput ?? "loading"}</span>
      </section> */}

      <header className="top-nav">
        <a className="nav-brand" href="#resolve">
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
          {/* <a href="#trust">Trust</a> */}
        </nav>
        <div className="nav-actions">
          <div className="nav-action-row">
            <ActionButton
              icon={<Trash2 size={16} />}
              label="Reset"
              title="Clear session"
              busy={busy === "clear"}
              onClick={clearCurrentSession}
              variant="danger"
            />
          </div>
          {/* <span className={`control-status ${controlStatus.state}`} aria-live="polite">
            {controlStatus.label}
          </span> */}
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
            Paste a DID, publish auth-1, and verify the passkey session from
            one browser console.
          </p>
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
        </aside>
      </section>

      <section className="product-showcase" id="product">
        <section className="dashboard-layout">
          <section className="main-stack">
            <section className="operations">
              <div className="section-heading">Workflow / Live Check</div>

            <div id="resolve">
              <Panel
                eyebrow="Identity"
                title="Resolve DID"
                result={results.resolver}
                actions={
                  <ActionButton
                    icon={<Link2 size={16} />}
                    label="Resolve DID"
                    title="Resolve DID"
                    busy={busy === "resolve"}
                    onClick={resolveDid}
                    disabled={!hasDidInput}
                  />
                }
              >
                <div className="field-grid two">
                  <TextField
                    label="DID"
                    value={did}
                    onChange={setDid}
                    placeholder="did:ckb..."
                    mono
                  />
                  <ValueField
                    label="Key ID"
                    value={keyId}
                    onCopy={() => copyValue("keyId", keyId)}
                    copied={copied === "keyId"}
                  />
                </div>
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
                    disabled={!domainReady || !hasResolvedDid}
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
                    onCopy={() => copyValue("didKey", didKey)}
                    copied={copied === "didKey"}
                  />
                </div>
              </Panel>
            </div>

            <div id="update">
              <Panel
                eyebrow="DID Update"
                title="Write auth-1 on chain"
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
                  </>
                }
              >
                <div className="field-grid two">
                  <ValueField
                    label="EVM wallet"
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
                  <ValueField
                    label="Capacity shannons"
                    value={displayCapacityShannons}
                    onCopy={() => copyValue("capacity", displayCapacityShannons)}
                    copied={copied === "capacity"}
                  />
                  <ValueField
                    label="Fee paid shannons"
                    value={feePaidShannons || readString(results.update.feePaidShannons)}
                    onCopy={() =>
                      copyValue(
                        "feePaid",
                        feePaidShannons || readString(results.update.feePaidShannons),
                      )
                    }
                    copied={copied === "feePaid"}
                  />
                </div>
                <div className="field-grid one">
                  <ValueField
                    label="Update transaction hash"
                    value={displayTxHash}
                    onCopy={() => copyValue("txHash", displayTxHash)}
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
                    icon={<RefreshCw size={16} />}
                    label="Round Trip"
                    title="Check DID round trip"
                    busy={busy === "roundtrip"}
                    onClick={checkRoundTrip}
                    disabled={!hasUsableDidKey}
                    variant="secondary"
                  />
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
                      icon={<KeyRound size={16} />}
                      label="Nonce"
                      title="Request nonce"
                      busy={busy === "nonce"}
                      onClick={requestNonce}
                      variant="secondary"
                    />
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
                <label className="text-label">
                  <span>Canonical SIWD Message</span>
                  <textarea value={message} readOnly spellCheck={false} rows={9} />
                </label>
                <ResultBlock title="Nonce" value={results.nonce} />
                <ResultBlock title="Session" value={results.session} />
              </Panel>
            </div>
          </section>
        </section>
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

      {/* <footer className="site-footer">
        <span>CKB Passport PoC</span>
        <span>{did}</span>
      </footer> */}
    </main>
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
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="text-label">
      <span>{label}</span>
      <input
        className={mono ? "mono" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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

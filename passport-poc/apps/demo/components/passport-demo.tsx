"use client";

import {
  clearSoftwareAuthKey,
  DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY,
  generateSoftwareAuthKey,
  loadSoftwareAuthKey,
  signInWithPasskey as createPasskeyProof,
  signInWithSoftwareKey,
  type SoftwareProofEnvelope,
  type WebAuthnProofEnvelope,
} from "@ckb-passport/siwd-browser";
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
  | "software"
  | "wallet"
  | "update"
  | "roundtrip"
  | "explorer"
  | "signin"
  | "replay"
  | "session"
  | "clear";

type ProofEnvelope = WebAuthnProofEnvelope | SoftwareProofEnvelope;

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

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
  const [authMethod, setAuthMethod] = useState<"webauthn" | "software">(
    "webauthn",
  );
  const [softwareKeyReady, setSoftwareKeyReady] = useState(false);
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
  const softwareStorageKey = `${DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY}:${trimmedDid || "pending"}:${keyId}`;
  const resolverMethods = readRecord(results.resolver.verificationMethods);
  const resolvedDidKey = resolverMethods ? readString(resolverMethods[keyId]) : "";
  const resolvedDid = readString(results.resolver.did);
  const hasResolvedDid =
    hasDidInput && results.resolver.ok === true && resolvedDid === trimmedDid;
  const explorerUrl = readString(results.explorer.updateTransactionUrl);
  const updateTxHash = readString(results.update.txHash);
  const evidenceTxHash = readString(results.explorer.updateTransactionHash);
  const displayDidKey = didKey || resolvedDidKey;
  const credentialDisplay =
    authMethod === "software" && softwareKeyReady
      ? "software key in IndexedDB"
      : credentialId;
  const displayTxHash = txHash || updateTxHash || evidenceTxHash;
  const displayCapacityShannons =
    capacityShannons ||
    readString(results.update.capacityShannons) ||
    readString(results.resolver.capacityShannons);
  const hasLocalDidKey = didKey.startsWith("did:key:zDna");
  const hasUsableDidKey = displayDidKey.startsWith("did:key:zDna");
  const hasTxHash = /^0x[0-9a-fA-F]{64}$/.test(displayTxHash);

  useEffect(() => {
    let cancelled = false;
    if (!hasDidInput) {
      setSoftwareKeyReady(false);
      return;
    }

    void loadSoftwareAuthKey({ storageKey: softwareStorageKey })
      .then((state) => {
        if (cancelled) {
          return;
        }
        setSoftwareKeyReady(Boolean(state));
        if (state?.didKey && authMethod === "software") {
          setDidKey(state.didKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSoftwareKeyReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authMethod, hasDidInput, softwareStorageKey]);

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

  async function requestAuthNonce(): Promise<JsonRecord> {
    return getJson(
      `/api/nonce?did=${encodeURIComponent(trimmedDid)}&keyId=${encodeURIComponent(keyId)}`,
    );
  }

  async function requestNonce() {
    await run("nonce", async () => {
      const body = await requestAuthNonce();
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
      if (!converted.ok || !nextDidKey) {
        setResults((current) => ({ ...current, passkey: converted }));
        return;
      }

      const rawCredentialId = new Uint8Array(credential.rawId);
      const nonceBody = await requestAuthNonce();
      const proofMessage = readString(nonceBody.message);
      if (!proofMessage) {
        throw new Error("Server did not return a proof-of-possession message");
      }

      const proof = await createPasskeyProof({
        did: trimmedDid,
        keyId,
        message: proofMessage,
        rpId: config.rpId,
        credentialId: rawCredentialId,
      });
      const proofOfPossession = await postJson(
        "/api/auth-key/proof-of-possession",
        {
          did: trimmedDid,
          keyId,
          didKey: nextDidKey,
          proof,
        },
      );
      if (!proofOfPossession.ok) {
        setResults((current) => ({
          ...current,
          nonce: nonceBody,
          passkey: {
            ...converted,
            ok: false,
            proofOfPossession,
          },
        }));
        return;
      }

      setAuthMethod("webauthn");
      setSoftwareKeyReady(false);
      setCredentialId(bytesToBase64Url(rawCredentialId));
      setDidKey(nextDidKey);
      setMessage("");
      setResults((current) => ({
        ...current,
        nonce: nonceBody,
        passkey: {
          ...converted,
          proofOfPossession,
        },
      }));
    });
  }

  async function generateSoftwareKey() {
    if (!hasResolvedDid) {
      return;
    }
    await run("software", async () => {
      const generated = await generateSoftwareAuthKey({
        storageKey: softwareStorageKey,
      });
      const nonceBody = await requestAuthNonce();
      const proofMessage = readString(nonceBody.message);
      if (!proofMessage) {
        throw new Error("Server did not return a proof-of-possession message");
      }

      const proof = await signInWithSoftwareKey({
        did: trimmedDid,
        keyId,
        message: proofMessage,
        storageKey: softwareStorageKey,
      });
      const proofOfPossession = await postJson(
        "/api/auth-key/proof-of-possession",
        {
          did: trimmedDid,
          keyId,
          didKey: generated.didKey,
          proof,
        },
      );
      if (!proofOfPossession.ok) {
        await clearSoftwareAuthKey({ storageKey: softwareStorageKey }).catch(
          () => undefined,
        );
        setResults((current) => ({
          ...current,
          nonce: nonceBody,
          passkey: {
            ok: false,
            didKey: generated.didKey,
            mode: "software",
            proofOfPossession,
          },
        }));
        return;
      }

      setAuthMethod("software");
      setSoftwareKeyReady(true);
      setCredentialId("");
      setDidKey(generated.didKey);
      setMessage("");
      setResults((current) => ({
        ...current,
        nonce: nonceBody,
        passkey: {
          ok: true,
          mode: "software",
          didKey: generated.didKey,
          proofOfPossession,
        },
      }));
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
        throw new Error("Controller signing challenge response is incomplete");
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
          message: "DID controller wallet connected",
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

  async function signInWithAuthKey() {
    await run("signin", async () => {
      if (!message) {
        throw new Error("Request a nonce before signing in");
      }

      const proof: ProofEnvelope =
        authMethod === "software"
          ? await signInWithSoftwareKey({
              did: trimmedDid,
              keyId,
              message,
              storageKey: softwareStorageKey,
            })
          : await signInWithWebAuthn();
      setLastProof(proof);
      const body = await postJson("/api/verify", { proof });
      setResults((current) => ({ ...current, verify: body }));
      await refreshSession();
    });
  }

  async function signInWithWebAuthn(): Promise<WebAuthnProofEnvelope> {
    requireWebAuthn(config, domainReady);
    return createPasskeyProof({
      did: trimmedDid,
      keyId,
      message,
      rpId: config.rpId,
      credentialId: credentialId
        ? new Uint8Array(base64UrlToBuffer(credentialId))
        : undefined,
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
    const keyToClear = softwareStorageKey;
    await run("clear", async () => {
      await postJson("/api/session/clear", {});
      await clearSoftwareAuthKey({ storageKey: keyToClear }).catch(() => undefined);
      resetDemoState();
    });
  }

  function resetDemoState() {
    setDid("");
    setKeyId(config?.defaultKeyId || INITIAL_KEY_ID);
    setDidKey("");
    setCredentialId("");
    setAuthMethod("webauthn");
    setSoftwareKeyReady(false);
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
        action === "register" || action === "software"
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
      }
    } finally {
      setBusy((current) => (current === action ? null : current));
    }
  }

  return (
    <main className="app-shell">
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
            Paste a DID, publish auth-1, and verify the auth-key session from
            one browser console.
          </p>
        </div>
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
                title="Create auth DID key"
                result={results.passkey}
                actions={
                  <>
                    <ActionButton
                      icon={<Fingerprint size={16} />}
                      label="Passkey"
                      title="Register passkey"
                      busy={busy === "register"}
                      onClick={registerPasskey}
                      disabled={!domainReady || !hasResolvedDid}
                    />
                    <ActionButton
                      icon={<KeyRound size={16} />}
                      label="Software Key"
                      title="Generate software auth key"
                      busy={busy === "software"}
                      onClick={generateSoftwareKey}
                      disabled={!hasResolvedDid}
                      variant="secondary"
                    />
                  </>
                }
              >
                <div className="field-grid two">
                  <ValueField
                    label="Credential"
                    value={credentialDisplay}
                    onCopy={() => copyValue("credential", credentialDisplay)}
                    copied={copied === "credential"}
                  />
                  <ValueField
                    label="Auth did:key"
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
                      label="Controller"
                      title="Connect DID controller EVM wallet"
                      busy={busy === "wallet"}
                      onClick={connectEvmWallet}
                      variant="secondary"
                    />
                    <ActionButton
                      icon={<Send size={16} />}
                      label="Submit"
                      title="Submit DID update with controller wallet"
                      busy={busy === "update"}
                      onClick={updateDid}
                      disabled={!hasLocalDidKey || !evmAccount}
                    />
                  </>
                }
              >
                <div className="field-grid two">
                  <ValueField
                    label="Controller account"
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
                    label="Controller chain ID"
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
                      disabled={!hasDidInput}
                      variant="secondary"
                    />
                    <ActionButton
                      icon={
                        authMethod === "software" ? (
                          <KeyRound size={16} />
                        ) : (
                          <Fingerprint size={16} />
                        )
                      }
                      label="Sign In"
                      title={`Sign in with ${authMethod === "software" ? "software key" : "passkey"}`}
                      busy={busy === "signin"}
                      onClick={signInWithAuthKey}
                      disabled={
                        !message ||
                        !hasUsableDidKey ||
                        (authMethod === "webauthn" && !domainReady) ||
                        (authMethod === "software" && !softwareKeyReady)
                      }
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
                <div className="segmented-control" role="group" aria-label="Auth method">
                  <button
                    type="button"
                    className={authMethod === "webauthn" ? "active" : undefined}
                    onClick={() => setAuthMethod("webauthn")}
                  >
                    Passkey
                  </button>
                  <button
                    type="button"
                    className={authMethod === "software" ? "active" : undefined}
                    onClick={() => setAuthMethod("software")}
                    disabled={!softwareKeyReady}
                  >
                    Software Key
                  </button>
                </div>
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

function readString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function readRecord(value: JsonValue | undefined): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
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

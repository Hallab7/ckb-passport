"use client";

import {
  signInWithPasskey as createPasskeyProof,
  type WebAuthnProofEnvelope,
} from "@ckb-passport/siwd-browser";
import {
  ccc,
  Provider as CccProvider,
  useCcc,
  useSigner,
} from "@ckb-ccc/connector-react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type ConfigPayload = {
  ok: boolean;
  network: string;
  expectedOrigin: string;
  rpId: string;
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
type TabKey = "resolve" | "register" | "signin" | "explorer";
type StageKey =
  | "resolve"
  | "register"
  | "possession"
  | "signin"
  | "crossOrigin"
  | "replay"
  | "roundtrip"
  | "explorer";
type BusyAction =
  | "config"
  | "connect"
  | "resolve"
  | "register"
  | "possession"
  | "signin"
  | "replay"
  | "roundtrip"
  | "explorer";

type WalletProfile = {
  walletName: string;
  signerName: string;
  address: string;
  identity: string;
  locks: ScriptPayload[];
};

type ScriptPayload = {
  codeHash: string;
  hashType: string;
  args: string;
};

type DidOption = {
  did: string;
  id?: string;
  capacityShannons?: string;
  verificationMethods?: JsonRecord;
  verificationMethodKeys?: string[];
};

const INITIAL_KEY_ID = "auth-1";
const INITIAL_FEE_RATE_SHANNONS_PER_KW = "1000";
const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "resolve", label: "Resolve", icon: <Link2 size={16} /> },
  { key: "register", label: "Register", icon: <Fingerprint size={16} /> },
  { key: "signin", label: "Sign In", icon: <KeyRound size={16} /> },
  { key: "explorer", label: "Explorer", icon: <ExternalLink size={16} /> },
];

function initialResults(): Record<StageKey, JsonRecord> {
  return {
    resolve: { ok: false, code: "idle", message: "Connect a wallet to find your DID." },
    register: {
      ok: false,
      code: "idle",
      message: "Resolve your DID before registering a passkey.",
    },
    possession: {
      ok: false,
      code: "idle",
      message: "Create a passkey before testing wrong-key refusal.",
    },
    signin: {
      ok: false,
      code: "idle",
      message: "Register a passkey before signing in.",
    },
    crossOrigin: {
      ok: false,
      code: "idle",
      message: "Sign in once to test origin binding.",
    },
    replay: {
      ok: false,
      code: "idle",
      message: "Sign in once before checking replay protection.",
    },
    roundtrip: {
      ok: false,
      code: "idle",
      message: "Register a passkey before checking the DID document.",
    },
    explorer: {
      ok: false,
      code: "idle",
      message: "Publish an update before creating explorer evidence.",
    },
  };
}

async function evmSignerFilter(signerInfo: ccc.SignerInfo): Promise<boolean> {
  return signerInfo.signer.signType === ccc.SignerSignType.EvmPersonal;
}

export function PassportDemo() {
  return (
    <CccProvider name="CKB Passport" hideMark signerFilter={evmSignerFilter}>
      <PassportDemoContent />
    </CccProvider>
  );
}

function PassportDemoContent() {
  const connector = useCcc();
  const signer = useSigner();
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [configError, setConfigError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("resolve");
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [walletProfile, setWalletProfile] = useState<WalletProfile | null>(null);
  const [availableDids, setAvailableDids] = useState<DidOption[]>([]);
  const [did, setDid] = useState("");
  const [signInDid, setSignInDid] = useState("");
  const [keyId, setKeyId] = useState(INITIAL_KEY_ID);
  const [didKey, setDidKey] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [feeRateShannonsPerKw, setFeeRateShannonsPerKw] = useState(
    INITIAL_FEE_RATE_SHANNONS_PER_KW,
  );
  const [feePaidShannons, setFeePaidShannons] = useState("");
  const [txHash, setTxHash] = useState("");
  const [capacityShannons, setCapacityShannons] = useState("");
  const [lastProof, setLastProof] = useState<WebAuthnProofEnvelope | null>(null);
  const [browserOrigin, setBrowserOrigin] = useState("");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [copied, setCopied] = useState("");
  const [results, setResults] =
    useState<Record<StageKey, JsonRecord>>(initialResults);

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
    void loadConfig();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!signer || !connector.signerInfo) {
      setWalletProfile(null);
      setAvailableDids([]);
      setDid("");
      setDidKey("");
      setCredentialId("");
      setFeePaidShannons("");
      setTxHash("");
      setCapacityShannons("");
      setLastProof(null);
      setResults(initialResults());
      return;
    }

    void resolveConnectedWallet(signer, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [connector.signerInfo, connector.wallet, signer]);

  const domainReady = useMemo(() => {
    if (!config || !browserOrigin) {
      return true;
    }
    return new URL(browserOrigin).hostname === config.rpId;
  }, [browserOrigin, config]);

  const expectedOriginUrl = config?.expectedOrigin ?? "http://localhost:3000";
  const selectedDid = did.trim();
  const signInDidValue = signInDid.trim();
  const activeTabDetails = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const selectedDidOption = availableDids.find((option) => option.did === selectedDid);
  const resolvedMethods = readRecord(selectedDidOption?.verificationMethods);
  const resolvedDidKey = resolvedMethods ? readString(resolvedMethods[keyId]) : "";
  const displayDidKey = didKey || resolvedDidKey;
  const displayCapacityShannons =
    capacityShannons || selectedDidOption?.capacityShannons || "";
  const explorerUrl =
    readString(results.explorer.updateTransactionUrl) ||
    readString(results.register.explorerUrl);
  const displayTxHash =
    txHash ||
    readString(results.register.txHash) ||
    readString(results.explorer.updateTransactionHash);
  const walletConnected = Boolean(walletProfile && signer);
  const sessionRecord = readRecord(results.signin.session);
  const sessionHasAddress = Boolean(
    sessionRecord && Object.prototype.hasOwnProperty.call(sessionRecord, "address"),
  );
  const didResolved = walletConnected && selectedDid.length > 0 && results.resolve.ok === true;
  const hasRegisteredPasskey = displayDidKey.startsWith("did:key:zDna");
  const hasTxHash = /^0x[0-9a-fA-F]{64}$/.test(displayTxHash);
  const canRegister = Boolean(
    signer &&
      walletProfile &&
      config &&
      didResolved &&
      domainReady &&
      walletProfile.identity,
  );
  const canSignIn = /^did:ckb:[a-z2-7]{32}$/.test(signInDidValue);

  async function loadConfig() {
    setBusy("config");
    try {
      const body = await getJson("/api/config");
      if (!body.ok) {
        setConfigError(friendlyError(body));
        return;
      }
      setConfig(body as unknown as ConfigPayload);
      setKeyId(readString(body.defaultKeyId) || INITIAL_KEY_ID);
      setFeeRateShannonsPerKw(
        readString(body.defaultFeeRateShannonsPerKw) ||
          INITIAL_FEE_RATE_SHANNONS_PER_KW,
      );
      setConfigError("");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy((current) => (current === "config" ? null : current));
    }
  }

  async function resolveConnectedWallet(
    activeSigner: ccc.Signer,
    isCancelled: () => boolean,
  ) {
    await run("connect", "resolve", async () => {
      const profile = await readWalletProfile(activeSigner);
      if (isCancelled()) {
        return;
      }
      setWalletProfile(profile);

      const body = await postJson("/api/did/resolve-wallet", {
        locks: profile.locks,
        walletName: profile.walletName,
        signerName: profile.signerName,
        walletAddress: profile.address,
        walletIdentity: profile.identity,
      });
      if (isCancelled()) {
        return;
      }

      setResults((current) => ({ ...current, resolve: body }));
      if (!body.ok) {
        setAvailableDids([]);
        setDid("");
        setCapacityShannons("");
        setDidKey("");
        return;
      }

      const dids = readDidOptions(body.dids);
      const selected = dids.find((option) => option.did === readString(body.did)) ?? dids[0];
      setAvailableDids(dids);
      applyDidSelection(selected);
      setActiveTab("resolve");
    });
  }

  async function resolveAgain() {
    if (!signer) {
      return;
    }
    await run("resolve", "resolve", async () => {
      const profile = walletProfile ?? (await readWalletProfile(signer));
      setWalletProfile(profile);
      const body = await postJson("/api/did/resolve-wallet", {
        locks: profile.locks,
        walletName: profile.walletName,
        signerName: profile.signerName,
        walletAddress: profile.address,
        walletIdentity: profile.identity,
      });
      setResults((current) => ({ ...current, resolve: body }));
      if (!body.ok) {
        setAvailableDids([]);
        setDid("");
        setCapacityShannons("");
        setDidKey("");
        return;
      }
      const dids = readDidOptions(body.dids);
      const selected = dids.find((option) => option.did === selectedDid) ?? dids[0];
      setAvailableDids(dids);
      applyDidSelection(selected);
    });
  }

  function chooseDid(nextDid: string) {
    const selected = availableDids.find((option) => option.did === nextDid);
    applyDidSelection(selected);
  }

  function applyDidSelection(selected: DidOption | undefined) {
    setDid(selected?.did ?? "");
    if (selected?.did) {
      setSignInDid(selected.did);
    }
    setCapacityShannons(selected?.capacityShannons ?? "");
    const methods = readRecord(selected?.verificationMethods);
    setDidKey(methods ? readString(methods[keyId]) : "");
    setCredentialId("");
    setTxHash("");
    setFeePaidShannons("");
    setLastProof(null);
  }

  async function registerPasskeyWithWallet() {
    if (!canRegister || !signer || !walletProfile || !config) {
      return;
    }

    await run("register", "register", async () => {
      requireWebAuthn(config, domainReady);
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomBuffer(32),
          rp: {
            id: config.rpId,
            name: "CKB Passport",
          },
          user: {
            id: randomBuffer(16),
            name: keyId,
            displayName: `CKB Passport ${keyId}`,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 60_000,
          attestation: "direct",
        },
      })) as PublicKeyCredential | null;

      if (!credential || credential.type !== "public-key") {
        throw new Error("The browser did not return a passkey.");
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const attestationObject = bytesToBase64Url(
        new Uint8Array(response.attestationObject),
      );
      const converted = await postJson("/api/passkey/did-key", { attestationObject });
      const nextDidKey = readString(converted.didKey);
      if (!converted.ok || !nextDidKey) {
        setResults((current) => ({ ...current, register: converted }));
        return;
      }

      setCredentialId(bytesToBase64Url(new Uint8Array(credential.rawId)));
      setDidKey(nextDidKey);

      const rawCredentialId = new Uint8Array(credential.rawId);
      const nonceBody = await requestAuthNonce();
      const proofMessage = readString(nonceBody.message);
      if (!proofMessage) {
        throw new Error("The server could not prepare passkey confirmation.");
      }

      const proof = await createPasskeyProof({
        did: selectedDid,
        keyId,
        message: proofMessage,
        rpId: config.rpId,
        credentialId: rawCredentialId,
        userVerification: "required",
      });
      const proofOfPossession = await postJson(
        "/api/auth-key/proof-of-possession",
        {
          did: selectedDid,
          keyId,
          didKey: nextDidKey,
          proof,
        },
      );
      if (!proofOfPossession.ok) {
        setResults((current) => ({
          ...current,
          register: {
            ...proofOfPossession,
            message: friendlyError(proofOfPossession),
          },
        }));
        return;
      }

      const prepared = await postJson("/api/did/wallet-update/prepare", {
        did: selectedDid,
        keyId,
        didKey: nextDidKey,
        evmAccount: walletProfile.identity,
        feeRate: feeRateShannonsPerKw,
      });
      if (!prepared.ok) {
        setResults((current) => ({ ...current, register: prepared }));
        return;
      }

      const challengeId = readString(prepared.challengeId);
      const signingMessage = readString(prepared.signingMessage);
      if (!challengeId || !signingMessage) {
        throw new Error("The wallet approval request was incomplete.");
      }

      const signature = await signer.signMessageRaw(signingMessage);
      const submitted = await postJson("/api/did/wallet-update/submit", {
        challengeId,
        evmAccount: walletProfile.identity,
        signature,
      });

      if (submitted.ok) {
        setCredentialId(bytesToBase64Url(rawCredentialId));
        setDidKey(nextDidKey);
        setTxHash(readString(submitted.txHash));
        setCapacityShannons(readString(submitted.capacityShannons));
        setFeePaidShannons(readString(submitted.feePaidShannons));
        setActiveTab("signin");
      }

      setResults((current) => ({
        ...current,
        register: {
          ...submitted,
          didKey: nextDidKey,
          credentialId: bytesToBase64Url(rawCredentialId),
        },
      }));
    });
  }

  async function checkPossessionRefusal() {
    if (!config || !selectedDid || !credentialId || !didKey) {
      return;
    }

    await run("possession", "possession", async () => {
      requireWebAuthn(config, domainReady);
      const result = await proveWrongKeyIsRejected(
        new Uint8Array(base64UrlToBuffer(credentialId)),
      );
      setResults((current) => ({
        ...current,
        possession: result,
      }));
    });
  }

  async function proveWrongKeyIsRejected(
    activeCredentialId: Uint8Array,
  ): Promise<JsonRecord> {
    if (!config) {
      throw new Error("The demo server is still loading.");
    }
    const nonceBody = await requestAuthNonce(selectedDid);
    const message = readString(nonceBody.message);
    if (!message) {
      throw new Error("The server could not prepare the refusal check.");
    }
    const proof = await createPasskeyProof({
      did: selectedDid,
      keyId,
      message,
      rpId: config.rpId,
      credentialId: activeCredentialId,
      userVerification: "required",
    });
    const rejected = await postJson("/api/auth-key/proof-of-possession", {
      did: selectedDid,
      keyId,
      didKey: "did:key:zDnaemkA1YkSdpbtH9NZ3JyCw9tZBWd8sywQhTx4N7SuFSvGU",
      proof,
    });
    const refused =
      rejected.ok === false &&
      readString(rejected.code) === "signature_verification_failed";
    return refused
      ? {
          ok: true,
          code: "wrong_key_refused",
          message: "Registration stopped before a transaction was built.",
          failsAtStep: readString(rejected.failsAtStep),
        }
      : {
          ok: false,
          code: "wrong_key_accepted",
          message: "The wrong-key proof was not rejected as expected.",
          failsAtStep: "",
        };
  }

  async function requestAuthNonce(didValue = selectedDid): Promise<JsonRecord> {
    return getJson(
      `/api/nonce?did=${encodeURIComponent(didValue)}&keyId=${encodeURIComponent(keyId)}`,
    );
  }

  async function signInWithRegisteredPasskey() {
    if (!config || !canSignIn) {
      return;
    }

    await run("signin", "signin", async () => {
      requireWebAuthn(config, domainReady);
      const nonceBody = await requestAuthNonce(signInDidValue);
      const proofMessage = readString(nonceBody.message);
      if (!proofMessage) {
        throw new Error("The server could not prepare sign-in.");
      }

      const proof = await createPasskeyProof({
        did: signInDidValue,
        keyId,
        message: proofMessage,
        rpId: config.rpId,
        credentialId: credentialId
          ? new Uint8Array(base64UrlToBuffer(credentialId))
          : undefined,
        userVerification: "required",
      });
      setLastProof(proof);
      const crossOrigin = await postJson("/api/verify/cross-origin", { proof });
      setResults((current) => ({ ...current, crossOrigin }));
      if (
        crossOrigin.ok ||
        readString(crossOrigin.code) !== "domain_mismatch"
      ) {
        throw new Error(
          "The cross-origin check did not fail at the expected domain-binding step.",
        );
      }
      const body = await postJson("/api/verify", { proof });
      setResults((current) => ({ ...current, signin: body }));
    });
  }

  async function replayLastProof() {
    await run("replay", "replay", async () => {
      if (!lastProof) {
        throw new Error("Sign in once before checking replay protection.");
      }
      const body = await postJson("/api/verify", { proof: lastProof });
      setResults((current) => ({ ...current, replay: body }));
    });
  }

  async function checkRoundTrip() {
    await run("roundtrip", "roundtrip", async () => {
      const body = await postJson("/api/did/roundtrip", {
        did: selectedDid,
        keyId,
        didKey: displayDidKey,
      });
      setResults((current) => ({ ...current, roundtrip: body }));
    });
  }

  async function createExplorerEvidence() {
    await run("explorer", "explorer", async () => {
      const body = await postJson("/api/evidence/explorer", {
        did: selectedDid,
        keyId,
        didKey: displayDidKey,
        txHash: displayTxHash,
        capacityShannons: displayCapacityShannons,
      });
      setResults((current) => ({ ...current, explorer: body }));
    });
  }

  async function disconnectWallet() {
    connector.disconnect();
    setWalletProfile(null);
    setAvailableDids([]);
    setDid("");
    setDidKey("");
    setCredentialId("");
    setFeePaidShannons("");
    setTxHash("");
    setCapacityShannons("");
    setLastProof(null);
    setResults(initialResults());
    setActiveTab("resolve");
  }

  async function readWalletProfile(activeSigner: ccc.Signer): Promise<WalletProfile> {
    const [address, identity, addressObjs] = await Promise.all([
      activeSigner.getRecommendedAddress().catch(() => ""),
      activeSigner.getIdentity().catch(() => ""),
      activeSigner.getAddressObjs(),
    ]);
    const locks = uniqueScripts(
      addressObjs.map(({ script }) => serializeScriptPayload(script)),
    );
    return {
      walletName: connector.wallet?.name ?? "Connected wallet",
      signerName: connector.signerInfo?.name ?? "Wallet account",
      address,
      identity,
      locks,
    };
  }

  async function run(
    action: BusyAction,
    resultKey: StageKey,
    fn: () => Promise<void>,
  ) {
    setBusy(action);
    try {
      await fn();
    } catch (error) {
      setResults((current) => ({
        ...current,
        [resultKey]: normalizeError(error),
      }));
    } finally {
      setBusy((current) => (current === action ? null : current));
    }
  }

  async function copyValue(label: string, value: string) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  return (
    <main className="app-shell">
      <header className="top-nav">
        <a className="nav-brand" href="#top" aria-label="CKB Passport">
          <span className="brand-mark">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span>CKB Passport</span>
        </a>
        <div className="nav-actions">
          {walletConnected ? (
            <>
              <span className="wallet-pill">{shorten(walletProfile?.address ?? "")}</span>
              <ActionButton
                icon={<LogOut className="logout-icon" size={16} />}
                label="Disconnect"
                title="Disconnect wallet"
                busy={false}
                onClick={disconnectWallet}
                variant="secondary"
              />
            </>
          ) : (
            <ActionButton
              icon={<Wallet size={16} />}
              label="Connect Wallet"
              title="Connect wallet"
              busy={busy === "connect"}
              onClick={() => {
                connector.open();
              }}
            />
          )}
        </div>
      </header>

      {!domainReady ? (
        <section className="domain-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Passkeys need the configured demo domain.</strong>
            <a href={expectedOriginUrl}>{expectedOriginUrl}</a>
          </div>
        </section>
      ) : null}

      {configError ? (
        <section className="domain-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Server configuration could not load.</strong>
            <span>{configError}</span>
          </div>
        </section>
      ) : null}

      <section className="hero-section" id="top">
        <div className="hero-copy">
          <span className="section-heading">Passkey DID access</span>
          <h1>Add passkey access to your DID.</h1>
          <p>
            Connect the wallet that owns your DID, register a browser passkey,
            then sign in without using the wallet again.
          </p>
        </div>
        <div className="hero-panel">
          <ProgressItem
            done={walletConnected}
            title="Wallet"
            detail={walletConnected ? walletProfile?.walletName : "Not connected"}
          />
          <ProgressItem
            done={didResolved}
            title="DID"
            detail={didResolved ? shorten(selectedDid, 14, 8) : "Waiting for wallet"}
          />
          <ProgressItem
            done={hasRegisteredPasskey}
            title="Passkey"
            detail={hasRegisteredPasskey ? "Registered" : "Not registered"}
          />
        </div>
      </section>

      <section className="workflow-shell">
        <aside
          className={`tab-list ${tabMenuOpen ? "open" : ""}`}
          aria-label="Demo tasks"
        >
          <button
            type="button"
            className="tab-menu-trigger"
            onClick={() => setTabMenuOpen((open) => !open)}
            aria-expanded={tabMenuOpen}
            aria-controls="passport-demo-tabs"
          >
            <Menu size={17} aria-hidden="true" />
            <span>{activeTabDetails.label}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div className="tab-options" id="passport-demo-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? "active" : undefined}
                onClick={() => {
                  setActiveTab(tab.key);
                  setTabMenuOpen(false);
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        </aside>

        <section className="tab-panel">
          {activeTab === "resolve" ? (
            <TaskPanel
              eyebrow="Resolve"
              title="Find the DID owned by your wallet"
              status={<StatusCard stage="resolve" result={results.resolve} />}
              actions={
                <>
                  <ActionButton
                    icon={<Wallet size={16} />}
                    label={walletConnected ? "Change Wallet" : "Connect Wallet"}
                    title="Connect wallet"
                    busy={busy === "connect"}
                    onClick={() => {
                      connector.open();
                    }}
                  />
                  <ActionButton
                    icon={<RefreshCw size={16} />}
                    label="Resolve Again"
                    title="Resolve connected wallet"
                    busy={busy === "resolve"}
                    onClick={resolveAgain}
                    disabled={!walletConnected}
                    variant="secondary"
                  />
                </>
              }
            >
              <InfoGrid>
                <InfoItem
                  label="Wallet"
                  value={walletProfile?.walletName ?? ""}
                  empty="Connect wallet"
                />
                <InfoItem
                  label="Address"
                  value={walletProfile?.address ?? ""}
                  empty="Not connected"
                  mono
                  onCopy={() => copyValue("wallet", walletProfile?.address ?? "")}
                  copied={copied === "wallet"}
                />
                <InfoItem
                  label="DID"
                  value={selectedDid}
                  empty="Not resolved"
                  mono
                  onCopy={() => copyValue("did", selectedDid)}
                  copied={copied === "did"}
                />
                <InfoItem
                  label="Current passkey"
                  value={resolvedDidKey}
                  empty="No passkey on DID yet"
                  mono
                  onCopy={() => copyValue("currentKey", resolvedDidKey)}
                  copied={copied === "currentKey"}
                />
              </InfoGrid>

              {availableDids.length > 1 ? (
                <label className="select-label">
                  <span>DID choice</span>
                  <select
                    value={selectedDid}
                    onChange={(event) => chooseDid(event.target.value)}
                  >
                    {availableDids.map((option) => (
                      <option key={option.did} value={option.did}>
                        {option.did}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </TaskPanel>
          ) : null}

          {activeTab === "register" ? (
            <TaskPanel
              eyebrow="Register"
              title="Add a passkey to your DID"
              status={
                <>
                  <StatusCard stage="register" result={results.register} />
                  <StatusCard stage="possession" result={results.possession} compact />
                </>
              }
              actions={
                <>
                  <ActionButton
                    icon={<Fingerprint size={16} />}
                    label="Register Passkey"
                    title="Create passkey and approve wallet update"
                    busy={busy === "register"}
                    onClick={registerPasskeyWithWallet}
                    disabled={!canRegister}
                  />
                  <ActionButton
                    icon={<ShieldCheck size={16} />}
                    label="Test Wrong Key"
                    title="Confirm registration refuses a key the passkey does not control"
                    busy={busy === "possession"}
                    onClick={checkPossessionRefusal}
                    disabled={!credentialId || !didKey || !selectedDid}
                    variant="secondary"
                  />
                </>
              }
            >
              <InfoGrid>
                <InfoItem
                  label="DID"
                  value={selectedDid}
                  empty="Resolve first"
                  mono
                  onCopy={() => copyValue("registerDid", selectedDid)}
                  copied={copied === "registerDid"}
                />
                <InfoItem label="Key ID" value={keyId} mono />
                <InfoItem
                  label="Passkey DID key"
                  value={displayDidKey}
                  empty="Not registered"
                  mono
                  onCopy={() => copyValue("didKey", displayDidKey)}
                  copied={copied === "didKey"}
                />
                <InfoItem
                  label="Wallet approval"
                  value={walletProfile?.address ?? ""}
                  empty="Connect wallet"
                  mono
                  onCopy={() => copyValue("approvalWallet", walletProfile?.address ?? "")}
                  copied={copied === "approvalWallet"}
                />
                <InfoItem
                  label="Update transaction"
                  value={displayTxHash}
                  empty="Pending"
                  mono
                  onCopy={() => copyValue("txHash", displayTxHash)}
                  copied={copied === "txHash"}
                />
                <InfoItem
                  label="Network fee"
                  value={feePaidShannons ? `${feePaidShannons} shannons` : ""}
                  empty="Calculated during signing"
                />
              </InfoGrid>
            </TaskPanel>
          ) : null}

          {activeTab === "signin" ? (
            <TaskPanel
              eyebrow="Sign In"
              title="Use the registered passkey"
              status={
                <>
                  <StatusCard stage="signin" result={results.signin} />
                  <StatusCard stage="crossOrigin" result={results.crossOrigin} compact />
                  <StatusCard stage="replay" result={results.replay} compact />
                </>
              }
              actions={
                <>
                  <ActionButton
                    icon={<KeyRound size={16} />}
                    label="Sign In"
                    title="Sign in with passkey"
                    busy={busy === "signin"}
                    onClick={signInWithRegisteredPasskey}
                    disabled={!domainReady || !canSignIn}
                  />
                  <ActionButton
                    icon={<RotateCcw size={16} />}
                    label="Check Replay"
                    title="Check replay protection"
                    busy={busy === "replay"}
                    onClick={replayLastProof}
                    disabled={!lastProof}
                    variant="secondary"
                  />
                </>
              }
            >
              <InfoGrid>
                <TextField
                  label="DID"
                  value={signInDid}
                  placeholder="did:ckb:..."
                  onChange={setSignInDid}
                />
                <InfoItem
                  label="Passkey"
                  value={canSignIn ? "Selected by this browser" : ""}
                  empty="Enter a DID first"
                />
                <InfoItem
                  label="Session DID"
                  value={sessionRecord ? readString(sessionRecord.did) : ""}
                  empty="Not signed in"
                  mono
                />
                <InfoItem
                  label="Session key"
                  value={sessionRecord ? readString(sessionRecord.keyId) : ""}
                  empty="Not signed in"
                  mono
                />
                <InfoItem
                  label="Wallet address in session"
                  value={
                    results.signin.ok
                      ? sessionHasAddress
                        ? "Present - proof failed"
                        : "Not present"
                      : ""
                  }
                  empty="Not checked"
                />
                <InfoItem
                  label="Origin and replay"
                  value={
                    results.crossOrigin.ok === false &&
                    results.replay.ok === false &&
                    readString(results.replay.code) !== "idle"
                      ? "Both protected"
                      : ""
                  }
                  empty="Not fully checked"
                />
              </InfoGrid>
            </TaskPanel>
          ) : null}

          {activeTab === "explorer" ? (
            <TaskPanel
              eyebrow="Explorer"
              title="Confirm the DID document update"
              status={
                <>
                  <StatusCard stage="roundtrip" result={results.roundtrip} compact />
                  <StatusCard stage="explorer" result={results.explorer} />
                </>
              }
              actions={
                <>
                  <ActionButton
                    icon={<RefreshCw size={16} />}
                    label="Check DID"
                    title="Check DID document"
                    busy={busy === "roundtrip"}
                    onClick={checkRoundTrip}
                    disabled={!hasRegisteredPasskey}
                    variant="secondary"
                  />
                  <ActionButton
                    icon={<ExternalLink size={16} />}
                    label="Build Evidence"
                    title="Build explorer evidence"
                    busy={busy === "explorer"}
                    onClick={createExplorerEvidence}
                    disabled={!hasRegisteredPasskey || !hasTxHash}
                  />
                  {explorerUrl ? (
                    <a
                      className="link-button"
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      Open Explorer
                    </a>
                  ) : null}
                </>
              }
            >
              <InfoGrid>
                <InfoItem
                  label="DID"
                  value={selectedDid}
                  empty="Resolve first"
                  mono
                  onCopy={() => copyValue("explorerDid", selectedDid)}
                  copied={copied === "explorerDid"}
                />
                <InfoItem
                  label="Passkey DID key"
                  value={displayDidKey}
                  empty="Register first"
                  mono
                  onCopy={() => copyValue("explorerKey", displayDidKey)}
                  copied={copied === "explorerKey"}
                />
                <InfoItem
                  label="Transaction"
                  value={displayTxHash}
                  empty="Pending"
                  mono
                  onCopy={() => copyValue("explorerTx", displayTxHash)}
                  copied={copied === "explorerTx"}
                />
                <InfoItem
                  label="Capacity"
                  value={
                    displayCapacityShannons
                      ? `${displayCapacityShannons} shannons`
                      : ""
                  }
                  empty="Pending"
                />
              </InfoGrid>
            </TaskPanel>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function TaskPanel({
  eyebrow,
  title,
  children,
  actions,
  status,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  status: ReactNode;
}) {
  return (
    <article className="task-panel">
      <div className="task-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="button-row">{actions}</div>
      </div>
      <div className="task-body">{children}</div>
      <div className="status-stack">{status}</div>
    </article>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="info-grid">{children}</div>;
}

function InfoItem({
  label,
  value,
  empty,
  mono,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  empty?: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div className="info-item">
      <span>{label}</span>
      <div className="info-value-row">
        <strong className={mono ? "mono" : undefined} title={hasValue ? value : empty}>
          {hasValue ? value : (empty ?? "Not set")}
        </strong>
        {onCopy ? (
          <button
            type="button"
            className="icon-button"
            onClick={onCopy}
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
            disabled={!hasValue}
          >
            {copied ? <CheckCircle2 size={16} /> : <Clipboard size={16} />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="info-item text-field">
      <span>{label}</span>
      <input
        className="mono"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

function ProgressItem({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail?: string;
}) {
  return (
    <div className={done ? "progress-item done" : "progress-item"}>
      <span>{done ? <CheckCircle2 size={16} /> : <span className="progress-dot" />}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail || "Waiting"}</small>
      </div>
    </div>
  );
}

function StatusCard({
  stage,
  result,
  compact,
}: {
  stage: StageKey;
  result: JsonRecord;
  compact?: boolean;
}) {
  const status = friendlyStatus(stage, result);
  return (
    <div className={`status-card ${status.tone} ${compact ? "compact" : ""}`}>
      <span className="status-icon">
        {status.tone === "success" ? (
          <CheckCircle2 size={17} />
        ) : status.tone === "error" ? (
          <AlertTriangle size={17} />
        ) : (
          <span className="progress-dot" />
        )}
      </span>
      <div>
        <strong>{status.title}</strong>
        <p>{status.description}</p>
      </div>
    </div>
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
  icon: ReactNode;
  label: string;
  title: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      className={`action-button ${variant}`}
      onClick={() => void onClick()}
      disabled={busy || disabled}
      title={title}
      aria-label={label}
    >
      {busy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : icon}
      <span>{label}</span>
    </button>
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
    throw new Error("This browser cannot create passkeys in the current context.");
  }
  if (!config) {
    throw new Error("The demo server is still loading.");
  }
  if (!domainReady) {
    throw new Error(`Open ${config.expectedOrigin} before using passkeys.`);
  }
}

function friendlyStatus(
  stage: StageKey,
  result: JsonRecord,
): { tone: "neutral" | "success" | "error"; title: string; description: string } {
  const idle = readString(result.code) === "idle";
  if (idle) {
    return {
      tone: "neutral",
      title: idleTitle(stage),
      description: readString(result.message),
    };
  }

  if (
    stage === "replay" &&
    result.ok === false &&
    readString(result.code) === "nonce_consumed"
  ) {
    return {
      tone: "success",
      title: "Replay protection works",
      description: "The old sign-in proof was rejected, as expected.",
    };
  }

  if (
    stage === "crossOrigin" &&
    result.ok === false &&
    readString(result.code) === "domain_mismatch"
  ) {
    return {
      tone: "success",
      title: "Cross-origin proof rejected",
      description: `The proof was refused at verifier step ${readString(result.failsAtStep) || "2"}.`,
    };
  }

  if (result.ok === true) {
    return successStatus(stage, result);
  }

  return {
    tone: "error",
    title: errorTitle(stage),
    description: friendlyError(result),
  };
}

function successStatus(
  stage: StageKey,
  result: JsonRecord,
): { tone: "success"; title: string; description: string } {
  switch (stage) {
    case "resolve":
      return {
        tone: "success",
        title: "DID found",
        description:
          "The connected wallet owns a DID that can be used in this demo.",
      };
    case "register":
      return {
        tone: "success",
        title: "Passkey registered",
        description:
          "The wallet approved the update and the passkey is now linked to the DID.",
      };
    case "possession":
      return {
        tone: "success",
        title: "Wrong key refused",
        description: `Registration stopped at verifier step ${readString(result.failsAtStep) || "12a / 12h"}, before transaction preparation.`,
      };
    case "signin":
      return {
        tone: "success",
        title: "Signed in",
        description:
          "The passkey matched the DID document and a browser session was created.",
      };
    case "crossOrigin":
      return {
        tone: "success",
        title: "Origin binding works",
        description: "The proof cannot be used by a different application origin.",
      };
    case "roundtrip":
      return {
        tone: "success",
        title: "DID document matches",
        description: "The passkey in the browser matches the key on the DID.",
      };
    case "explorer":
      return {
        tone: "success",
        title: "Explorer evidence ready",
        description: "The transaction link is ready to share.",
      };
    case "replay":
      return {
        tone: "success",
        title: "Replay protection works",
        description: "The old sign-in proof cannot be reused.",
      };
  }
}

function idleTitle(stage: StageKey): string {
  switch (stage) {
    case "resolve":
      return "Wallet not checked";
    case "register":
      return "Passkey not registered";
    case "possession":
      return "Wrong-key refusal not checked";
    case "signin":
      return "Not signed in";
    case "crossOrigin":
      return "Origin binding not checked";
    case "replay":
      return "Replay not checked";
    case "roundtrip":
      return "DID document not checked";
    case "explorer":
      return "Explorer evidence not ready";
  }
}

function errorTitle(stage: StageKey): string {
  switch (stage) {
    case "resolve":
      return "DID was not found";
    case "register":
      return "Registration stopped";
    case "possession":
      return "Wrong-key refusal failed";
    case "signin":
      return "Sign-in failed";
    case "crossOrigin":
      return "Cross-origin check failed";
    case "replay":
      return "Replay check failed";
    case "roundtrip":
      return "DID document check failed";
    case "explorer":
      return "Explorer evidence failed";
  }
}

function friendlyError(result: JsonRecord): string {
  const code = readString(result.code);
  if (code === "wallet_did_not_found") {
    return "This wallet does not currently own a DID cell on testnet.";
  }
  if (code === "did_lock_wallet_mismatch") {
    return "The connected wallet does not own this DID.";
  }
  if (code === "did_document_decode_failed") {
    return "The DID was found, but its document is not in the format this demo expects.";
  }
  if (code === "did_update_wallet_submit_failed") {
    return "The network rejected the update transaction. Try resolving again, then register once more.";
  }
  if (code === "origin_mismatch" || code === "domain_mismatch") {
    return "The passkey request came from the wrong domain for this demo.";
  }
  if (code === "nonce_replayed" || code === "nonce_consumed") {
    return "That sign-in proof was already used.";
  }
  return readString(result.message) || "Something went wrong. Please try again.";
}

function normalizeError(error: unknown): JsonRecord {
  return {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

function serializeScriptPayload(script: {
  codeHash: string;
  hashType: string;
  args: string;
}): ScriptPayload {
  return {
    codeHash: script.codeHash,
    hashType: script.hashType,
    args: script.args,
  };
}

function uniqueScripts(scripts: ScriptPayload[]): ScriptPayload[] {
  const seen = new Set<string>();
  return scripts.filter((script) => {
    const key = `${script.codeHash}:${script.hashType}:${script.args}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readDidOptions(value: JsonValue | undefined): DidOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as JsonRecord;
    const did = readString(record.did);
    if (!did) {
      return [];
    }
    return [
      {
        did,
        id: readString(record.id),
        capacityShannons: readString(record.capacityShannons),
        verificationMethods: readRecord(record.verificationMethods),
        verificationMethodKeys: readStringArray(record.verificationMethodKeys),
      },
    ];
  });
}

function readString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function readRecord(value: JsonValue | undefined): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
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

function shorten(value: string, left = 10, right = 6): string {
  if (!value || value.length <= left + right + 3) {
    return value;
  }
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

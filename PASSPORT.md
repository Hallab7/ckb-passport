# Passport — Sign in with `did:ckb`

**Ask:** $6,000 USD equivalent · **Duration:** 12 weeks · **Target:** CKB Community Fund DAO
**Scope:** testnet-first, mainnet resolution read-only. No fund movement.

---

## 1. What this is

An authentication layer that lets any CKB application log a user in with their `did:ckb` instead of
their wallet address.

`did:ckb` is deployed on mainnet, specified in WIP-01, and shipping as `@ckb-ccc/did-ckb` on npm.
What does not exist is anywhere to *use* it. A DID with no relying parties is a passport for a
country with no borders. Passport builds the borders: the protocol, the libraries, and the first two
sites that accept it.

---

## 2. The problem, stated accurately

Every CKB application today authenticates with **Connect Wallet**. `ccc.connect()` returns the
user's **address**, which encodes a lock script.

That single identifier is enough to derive everything else. Given the lock hash, any party can call
`get_cells` on a public indexer and enumerate every live cell under that lock — CKB capacity, every
xUDT balance, every Spore — then walk cell lineage backwards through history. Nothing is being
"leaked" in a dramatic sense; the address is simply a lookup key into a public ledger, and the app
now holds it.

Three consequences follow, and none of them are addressed by any existing CKB tooling:

1. **Authentication is welded to spending authority.** The signature that logs you in is produced by
   the same key that moves your funds. A site that asks for a login signature can present a
   transaction instead. There is no key you can safely give an application.
2. **Your position is disclosed as a side effect of logging in.** You wanted to prove you are a
   returning user; you disclosed your balance sheet.
3. **Your identity dies with your key.** Because the address *is* the identity, rotating a
   compromised key makes you a stranger on every application simultaneously. There is no recovery
   path that preserves your accounts.

`did:ckb` was designed against exactly this. From WIP-01's data model, the **Lock Script**
authorises updates to the DID, while **`verificationMethods`** holds the keys that speak *for* the
DID. They are different keys. Jan Xie's framing (/t/9506):

> An **address-decoupled** identifier that can last 300 years and stays under the owner's control.
> **No registrar, no coupling to a spend key, and anonymous.** It's the **passport** you carry
> across the Web5 world.

---

## 3. How `did:ckb` actually works

Grounded in [WIP-01](https://github.com/web5fans/web5-wips/blob/master/01.md), not generic DID
theory. This matters because the login flow is a direct consequence of the data model.

### 3.1 The on-chain object

A **DID Metadata Cell**:

| field | contents |
|---|---|
| **type script args** | the 20-byte method-specific identifier — *the DID itself* |
| **lock script** | authorises update and deactivation (the **control** key) |
| **data** | Molecule `DidCkbData` → `document` → DAG-CBOR → the DID metadata |

### 3.2 The identifier

Generated exactly like CKB's [type-id](https://docs.nervos.org/docs/script/type-id):
BLAKE2b (personalisation `ckb-default-hash`, 32-byte output) over, in order —

```
inputs[0].since                       8 bytes
inputs[0].previous_output.tx_hash    32 bytes
inputs[0].previous_output.index       4 bytes  little-endian
DID Metadata Cell output index        8 bytes  little-endian
```

First 20 bytes → base32, lowercase → 32 characters:

```
did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba
```

### 3.3 The document

`did:plc`-compatible, minus the PLC-specific fields (`type`, `rotationKeys`, `prev`, `sig`):

```json
{
  "verificationMethods": { "atproto": "did:key:zSigningKey" },
  "alsoKnownAs": ["at://alice.test"],
  "services": {
    "atproto_pds": {
      "type": "AtprotoPersonalDataServer",
      "endpoint": "https://example.test"
    }
  }
}
```

Three things to notice, because Passport depends on all three:

- **`verificationMethods` is a map of `did:key`-encoded public keys.** These are the auth keys. They
  are not the lock. This is the decoupling, expressed in the data model.
- **`alsoKnownAs` gives you handles** — `at://alice.test`. Users type a handle, not a 32-character
  identifier.
- **`services` already carries PDS endpoints.** The data model anticipates ATProto personal data
  servers, which is why this composes with idea 17 later.

### 3.4 Resolution

1. base32 → 20 bytes
2. Search **live cells** matching the DID type script with those args
3. Conflict resolution if several exist: trace each to its genesis transaction, order by position in
   the chain then output index, **earliest wins**
4. Extract `document`, decode DAG-CBOR → JSON
5. Transform to a W3C DID Document (the `did:plc` SDK can be reused)

**Deactivation** consumes the cell with no replacement, authorised by the lock. WIP-01: *"Applications
MUST warn users that deactivation is permanent and irreversible."* A resolver returning no live cell
means deactivated — which the verifier must treat as a hard failure, not a lookup miss.

---

## 4. The login flow

### 4.1 One-time: getting a DID

Done once, in Vellum or any DID application. Not part of a login.

1. User clicks **Create DID**
2. Browser creates a **passkey** (WebAuthn) — Face ID / Touch ID
3. The passkey's public key is encoded as a `did:key` and written into `verificationMethods`
4. One transaction creates the DID Metadata Cell
5. The user now has `did:ckb:qq2m…` and a passkey that speaks for it

**Honest cost:** the cell occupies capacity, so someone funds this once. That is the CKB capacity
floor showing up again, and it is the natural place for sponsorship. State it; don't hide it.

### 4.2 Every login after

```
┌─ user ──────────┐        ┌─ app.example ─────┐        ┌─ CKB ────────┐
│ 1. "Sign in     │        │                   │        │              │
│    with CKB"    │───────▶│ 2. build challenge│        │              │
│                 │        │    (SIWE-shaped)  │        │              │
│ 3. Face ID      │◀───────│                   │        │              │
│    signs it     │        │                   │        │              │
│                 │───────▶│ 4. verify:        │        │              │
│                 │        │    a. form/domain │        │              │
│                 │        │       /nonce/exp  │        │              │
│                 │        │    b. resolve DID ├───────▶│ live cell by │
│                 │        │                   │◀───────│ type args    │
│                 │        │    c. read vm key │        │              │
│                 │        │    d. verify sig  │        │              │
│                 │        │    e. not deactiv.│        │              │
│ 6. logged in    │◀───────│ 5. issue session  │        │              │
└─────────────────┘        └───────────────────┘        └──────────────┘
```

The challenge is [EIP-4361 / SIWE](https://eips.ethereum.org/EIPS/eip-4361)-shaped — a proven,
five-year-old, widely-implemented pattern, which keeps both the design argument and the review
surface small:

```
app.example wants you to sign in with your CKB DID.

DID:      did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba
Key:      atproto
Domain:   app.example
URI:      https://app.example/login
Nonce:    8f3c1a94e2b7
Issued:   2026-09-02T10:00:00Z
Expires:  2026-09-02T10:05:00Z
Chain:    ckb-mainnet
Version:  1
```

**No extension. No connect popup. No address. No transaction. No gas.**

### 4.3 Two key-custody modes

**Passkey mode (primary).** The verificationMethod is a P-256 public key from a platform
authenticator, encoded as `did:key` (multicodec `p256-pub`, identifiers beginning `zDn…`). This is
the mode that makes Passport usable by someone with no wallet and no seed phrase, and JoyID has
already established passkeys as normal on CKB.

**One precision that is real implementation work:** a WebAuthn assertion is not a raw signature over
your message. The challenge is embedded in `clientDataJSON`, and the signature covers
`authenticatorData || SHA-256(clientDataJSON)`. The verifier therefore performs WebAuthn
verification — reconstruct, check origin and type, then verify P-256 — not a plain signature check.
Standard, well-trodden, and it belongs in M1's estimate rather than being discovered in week 9.

**Wallet mode (fallback).** The verificationMethod is a secp256k1 key held by a wallet; login is a
message-signature request. Less pleasant, no passkey dependency, and it is the escape hatch if
binding a passkey to a verificationMethod turns out to be blocked. **Verify which is possible in
week 1.**

---

## 5. What it is useful for

Ranked by how confidently I would defend each.

**1. Rotate a key without losing your accounts.** Today the address *is* the identity, so a lost or
compromised wallet makes you a stranger on every application at once, with no recovery path. With a
DID you rotate the verificationMethod, the identifier is unchanged, and every relying party still
knows you. This is the most practical benefit and it is available immediately.

**2. Login carries no spend authority.** A verificationMethod key is not a lock script. It cannot
move funds. A malicious site that obtains a login signature obtains a login signature. This
eliminates an entire phishing class rather than mitigating it.

**3. Login does not disclose your position.** The application receives a DID, a public key, and
whatever you chose to publish in `alsoKnownAs` / `services`. It does not receive a lock hash it can
enumerate.

**4. Login without a wallet at all.** Passkey mode means a user with no CKB, no extension and no
seed phrase can hold an identity and sign in. For onboarding this is the difference between
"install a wallet, acquire CKB, then use our app" and "Face ID." (Subject to §4.1's funding caveat.)

**5. Recovery becomes expressible.** Because the DID cell's lock is an ordinary CKB lock, it can be
a multisig or a social-recovery lock. WIP-01 §5 says this explicitly — a multisig lock, or a
quantum-resistant lock, to mitigate key compromise. Address-as-identity can never offer this.

**6. It is the presentation layer for claims.** Vellum issues reputation; CKBoost issues quest
points; CKB-PoP issues attendance. All attach to a DID. Without a login there is no way for a user
to *present* any of it to an application. Passport is what makes everything Vellum issues
consumable.

**7. Portable identity across applications.** One DID works everywhere. Your handle, claims and
history follow you between apps instead of being re-established per address.

## 6. What it does *not* give you

Stated plainly, because two of these are claims I made earlier and could not support.

- **Not anonymity from the application.** The app receives your DID during login. It can store it.
- **Not cross-site unlinkability.** Two colluding sites both hold the same DID and can trivially
  correlate you. Real unlinkability needs either a distinct DID per site (each is a cell — the
  capacity cost makes this impractical) or a zero-knowledge proof of "I control a key in *some*
  valid DID" without revealing which. The second is genuinely interesting future work and is **not**
  in this scope.
- **Not automatic address privacy.** The DID Metadata Cell's **lock is visible on chain**. If a user
  controls their DID with their main funds lock, resolving the DID reveals that lock and relinks
  them to their address. Mitigation is a distinct lock for the DID cell — a documentation, default,
  and threat-model problem, and one this project must address explicitly rather than assume away.
- **Nothing about payments.** Tipping and spending are a separate concern (Fiber Link, Clasp).

---

## 7. Milestones — 12 weeks, $1,500 each

25% / 25% / 25% / 25%, the split the community prefers and the one Vellum v2 adopted.

### M1 · The protocol and verifier · weeks 1–3 · $1,500
- **SIWD specification**: message format, domain binding, nonce store, expiry, replay protection,
  human-readable statement. Modelled on EIP-4361.
- **Reference verifier**: resolve the DID (live-cell lookup by type args, WIP-01 §3.3 conflict
  resolution), decode Molecule → DAG-CBOR, select the named verificationMethod, verify.
- **WebAuthn verification path** (`authenticatorData || SHA-256(clientDataJSON)`, P-256) and the
  secp256k1 wallet path.
- **Deactivation handling**: no live cell → authentication fails closed.
- **Threat model as a deliverable**, not a paragraph: replay, session fixation, phishing,
  rotation-mid-session, the DID-cell lock leak of §6, resolver trust, and conflict-resolution abuse.
- **Week-1 gate:** confirm a passkey can be bound to a verificationMethod. If not, drop passkey mode
  openly and proceed with wallet mode.
- *Ships:* spec, verifier, client, threat model, and a live site you can log into.

### M2 · Key lifecycle · weeks 4–6 · $1,500
The part that turns benefit 1 and 5 from claims into behaviour. *(This replaces an earlier draft
that promised cross-site unlinkability, which §6 explains is not achievable as scoped.)*
- **Rotation semantics.** Rotate a verificationMethod in Vellum; sessions signed by the retired key
  become invalid; new logins work; the relying party's record of the user survives untouched.
- **Revocation propagation.** How long may a relying party cache a resolved document? What is the
  worst-case window between a user rotating a compromised key and every app honouring it? Specify
  it, then measure it.
- **Deactivation.** Sessions terminate; the app's account record is handled explicitly rather than
  orphaned.
- **DID-cell lock hygiene.** Guidance and defaults so a user's DID is not controlled by their main
  funds lock, plus a resolver-side warning when it is. This is the mitigation for §6's leak.
- **Recovery reference**: a worked multisig-lock DID (WIP-01 §5) with a documented recovery drill.
- *Ships:* rotation and revocation spec, an implementation, and a recorded end-to-end drill —
  compromise, rotate, recover, accounts intact.

### M3 · Adoption surface · weeks 7–9 · $1,500
- **Express / Fastify middleware** and a **browser client**. Target: ten lines to integrate.
- **A CCC connector**, so an application already calling `ccc.connect()` can receive a *DID session*
  instead of an address. This is the entire adoption strategy: existing apps get Passport without
  adopting a new stack.
- **Passkey UX**: create, sign, and recover, without a wallet in the loop.
- *Ships:* published npm packages, reference docs, and a recording of a developer who is not the
  author integrating in under ten minutes.

### M4 · Two relying parties · weeks 10–12 · $1,500
- **Nervos Talk Discourse plugin.** Sign in with `did:ckb`; posts carry a verified DID. This is
  janx's literal request from /t/9968, unanswered since February 2026.
- **A second relying party that is not the author's.** One integration is a demo; two is a standard.
  **Recruitment starts in week 1, not week 10.**
- **A governance reference pattern** (documentation, not a built feature): DID-gated eligibility a
  future DAO version or CKBA membership process could consume. The discussion stage currently passes
  on 30 likes with no identity behind it — a commenter in the DAO's own rules thread asks *"What if
  someone creates 30 google accounts then spam the votes."* **This proposal does not claim to fix
  vote weighting**, which is a meta-rule change requiring 67% and 185M quorum.
- *Ships:* both integrations live, plus an integration guide.

**Explicitly out of scope:** issuing credentials (Vellum's job), selective disclosure of claims
(needs Vellum's claim format settled first), ZK unlinkability, changing DAO vote weighting, and any
mainnet fund movement.

---

## 8. How each milestone is verified

No code review required for any of it.

| M | verification |
|---|---|
| M1 | Open the demo site, sign in with a `did:ckb`, no wallet extension involved. Then attempt a replay of the same signed message — rejected. Read the threat model. |
| M2 | Rotate a key in Vellum on video: the old session dies, the new key works, the relying party's account record is unchanged. Then the multisig recovery drill. |
| M3 | Watch the recording of a third-party developer integrating. Then `npm install` and do it yourself. |
| M4 | Log in to Nervos Talk with a DID. Log in to the second site with the same DID. |

---

## 9. "Is `did:ckb` alive?" — pre-empting the Vellum v1 objection

Vellum v1 did not pass stage 2. The stated opposition (/t/10419 #5, clarified in #7) was that
*"the protocol's initiator doesn't appear to have strong confidence in the protocol or to be
sufficiently committed to its continued development"* — meaning `did:ckb` itself. This section
belongs near the top of the actual proposal, not in the replies.

**Evidence:**
- `@ckb-ccc/did-ckb` — **v0.2.9 published 2026-08-17**, 21 published versions.
- PR [ckb-devrel/ccc#376](https://github.com/ckb-devrel/ccc/pull/376) — advanced `did:ckb`
  operations, reviewed and merged into CCC.
- The contracts are deployed and resolving on **mainnet**; Vellum exercises claim, edit, rotate,
  deactivate, resolve and `did:plc` migration against them.
- [web5fans/did-ckb](https://github.com/web5fans/did-ckb) has commits through this year.

**And the structural argument, which is the stronger half:** Passport depends on a **deployed
contract and a published specification**, not on any team's roadmap. If every upstream contributor
stopped tomorrow, the type script still validates, the cells still resolve, and Passport still
works. That is precisely the property that makes an open primitive worth building on — the objection
is the argument.

---

## 10. Risks, named by the applicant

- **Adoption is the entire risk.** DID login has failed in other ecosystems for want of relying
  parties. Mitigations: the CCC connector (zero-effort for existing apps) and a named partner.
  **If no partner can be recruited during the discussion stage, that is real signal about the idea.**
- **Passkey binding may not be possible.** Week-1 gate; drop it openly and ship wallet mode.
- **The DID-cell lock leak (§6)** is a genuine limitation of the current design, not a bug this
  project introduces. It is addressed by defaults and documentation, not eliminated.
- **Solo developer, 12 weeks.** Spec and packages open-source from the first commit so the work is
  continuable by others.
- **Sequencing against Vellum v2**, which went to vote 2026-08-27. Asking the same voters for a
  second grant in quick succession is a risk independent of merit. If v2 passed, ship a visible M1
  first so this lands on a delivery record. If it failed, consider folding the strongest half of
  each into a single identity-stack proposal.

---

## 11. Proposal mechanics (CKB Community Fund DAO)

From the [DAO rules](https://talk.nervos.org/t/6874):
- **Discussion stage** on Nervos Talk: 30 likes within one week. → *Ship M1 before posting. A plan
  does not get 30 likes; a site you can log into does.*
- **Voting stage** on [Metaforo](https://dao.ckb.community/): proposer needs ≥100,000 CKB in the
  Nervos DAO; quorum is 3× the CKB requested; 51% yes; 7 days; weight = current Nervos DAO deposits.
- **Execution:** `[Status Update]` posts per milestone.
- Note (/t/10472): Metaforo access problems cost turnout during the Vellum v1 vote. Announce the
  vote before it opens and post a mid-vote reminder.

---

## 12. References

**Specification and code**
- [WIP-01, `did:ckb` Method Specification](https://github.com/web5fans/web5-wips/blob/master/01.md) — identifier generation §2.2, data model §3.2.4, resolution §3.3, deactivation §3.5, security §5
- [web5fans/did-ckb](https://github.com/web5fans/did-ckb) · [`@ckb-ccc/did-ckb`](https://www.npmjs.com/package/@ckb-ccc/did-ckb) · [ckb-devrel/ccc#376](https://github.com/ckb-devrel/ccc/pull/376)
- [CKB type-id script](https://docs.nervos.org/docs/script/type-id) — the identifier derivation Passport must reimplement in the verifier

**Standards**
- [EIP-4361 · Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) — the message pattern
- [W3C DID Core](https://www.w3.org/TR/did-1.0/) · [did:key](https://w3c-ccg.github.io/did-method-key/) · [did:plc v0.1](https://web.plc.directory/spec/v0.1/did-plc)
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) — assertion structure and verification
- [RFC 7693 BLAKE2](https://www.rfc-editor.org/rfc/rfc7693) · [RFC 4648 base32](https://www.rfc-editor.org/rfc/rfc4648.html) · [DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/spec/)
- [ATProto](https://atproto.com/) — the PDS endpoints already present in `services`

**Forum**
- [/t/9968](https://talk.nervos.org/t/9968) Idea Hunt — janx: *"login NervosTalk with my did:web5 and tip posts I like with Fiber payment"* (#7)
- [/t/9506](https://talk.nervos.org/t/9506) My Web5, Your Web5 — address-decoupled `did:web5` as pillar one
- [/t/9505](https://talk.nervos.org/t/9505) Web5: Own Data, Not Tokens
- [/t/10419](https://talk.nervos.org/t/10419) Vellum v1 — the vote and the stated objection ·
  [/t/10613](https://talk.nervos.org/t/10613) Vellum v2 · [/t/10274](https://talk.nervos.org/t/10274) Vellum reference dashboard
- [/t/10472](https://talk.nervos.org/t/10472) Metaforo access during the Vellum vote
- [/t/6874](https://talk.nervos.org/t/6874) DAO rules and process
- [/t/10124](https://talk.nervos.org/t/10124) DAO v1.1 Web5 identity layer review · [/t/10089](https://talk.nervos.org/t/10089) hidden voter profiles · [/t/10340](https://talk.nervos.org/t/10340) CKBA membership
- [/t/9845](https://talk.nervos.org/t/9845) Fiber Link — the tipping half of janx's request

**Related work in this repo**
- [idea 22](ideas/22-passport-did-login.md) — the original Spark-scale version
- [idea 17 · Homestead](ideas/17-homestead-pds.md) — the PDS that `services.atproto_pds` points at
- [WEB5.md](WEB5.md) — why identity and data are the ecosystem's stated direction

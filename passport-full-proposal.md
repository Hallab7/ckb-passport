# [DIS] Passport: Sign in with `did:ckb`

**Applicant:** Hallab
**Requested funding:** $6,000 USD equivalent, paid in CKB at the USD value at the time of each disbursement
**ETA to completion:** 12 weeks from disbursement of initial funding
**Target:** CKB Community Fund DAO
**Scope:** Testnet-first implementation. Mainnet `did:ckb` resolution is read-only. No mainnet fund movement.
**CKB wallet or funding address:** [Add CKB address before voting-stage submission]
**Date:** 2026-09-04

## Summary

One-paragraph overview:

This proposal requests a grant of $6,000 to build Passport, an open-source Sign-In with CKB DID
authentication layer that lets CKB applications log users in with `did:ckb` instead of wallet
addresses. Passport turns the existing `did:ckb` identity primitive into something applications can
actually use: a protocol, verifier, browser client, server middleware, CCC connector, and two
relying-party integrations, all built and tested on testnet with mainnet DID resolution kept
read-only.

Deliverables:

- Sign-In with CKB DID message format and verification specification.
- Reference verifier for `did:ckb` login challenges.
- Browser client for creating and submitting login proofs.
- Passkey/WebAuthn authentication path if the week-1 feasibility gate confirms it.
- Wallet-message authentication fallback.
- Key rotation, revocation, deactivation, and recovery behavior.
- Express or Fastify middleware for relying applications.
- CCC connector or adapter that returns a DID session instead of a wallet-address session.
- Demo application showing login with no address disclosure during authentication.
- Two relying-party integrations, with Nervos Talk or an equivalent CKB community application as
  the preferred first integration.
- Threat model, test vectors, integration guide, demo recordings, and maintenance support.

All deliverables ship on testnet or as application-layer packages. Passport does not move mainnet
funds.

Grant Amount Requested: $6,000 USD equivalent, paid in CKB at the USD value at the time of each
disbursement

ETA to Completion: 12 weeks from disbursement of initial funding

CKB Wallet or Funding Address: [Add CKB address before voting-stage submission]

## Project Introduction

What problem are we solving:

Most CKB applications today authenticate users through Connect Wallet. A wallet address is useful
for asset actions, but it is too blunt as the default account identity for every application. When
an application receives an address or lock hash during login, it receives a lookup key into public
on-chain activity. It also asks the user to authenticate with a wallet context that may be able to
move funds. Finally, when the address is the account, rotating away from a compromised key can make
the user appear to be a new person across applications.

The result is that CKB has a strong identity primitive in `did:ckb`, but ordinary applications still
fall back to wallet addresses for login. The missing layer is a relying-party standard: a way for an
app to ask for a DID login proof, verify it safely, bind it to the app's domain, reject replays,
handle key rotation, and create a normal application session without collecting a wallet address.

What this addresses:

Passport provides that relying-party layer. A user signs a domain-bound challenge with a key listed
in their `did:ckb` document. The relying application resolves the DID, verifies the selected
verification method, validates the challenge, rejects expired or replayed proofs, and creates a
session for the DID.

The user does not sign a transaction to log in. The application does not need a wallet address to
recognize the user. The authentication key can rotate while the DID remains stable. Existing CKB
applications can adopt the flow through middleware and a CCC connector rather than rewriting their
stacks.

Why now:

Three things have lined up:

- The `did:ckb` infrastructure is real enough to build on. WIP-01 specifies the method,
  `@ckb-ccc/did-ckb` is published on npm, and CCC PR #376 added advanced DID helper, resolver,
  history-walk, and migration functionality to the CKB JavaScript ecosystem.
- The identity stack now needs real relying-party pressure. DID create, update, rotate, deactivate,
  and resolve operations are useful foundations, but the primitive becomes valuable when other
  applications can accept it as a login identity.
- CKB community applications are reaching the point where reputation, claims, community membership,
  forums, quests, and governance tools need identity without making every interaction a wallet
  login. Passport is the smallest useful bridge between `did:ckb` and those applications.

## Team & Roles

- **Name / handle:** [Applicant name / handle]
- **Role:** Solo developer covering protocol specification, TypeScript SDK work, verifier logic,
  backend middleware, frontend demo, documentation, and integration coordination.
- **Relevant background:** [Add prior CKB, DID, SDK, frontend, backend, or security work here.]
- **Why CKB:** CKB's Cell model makes durable identity state natural. A `did:ckb` identifier is
  backed by a DID Metadata Cell, while CKB lock scripts can express update authority, recovery
  arrangements, and deactivation. Passport uses those properties to separate login identity from
  spending authority.

Links:

- GitHub: https://github.com/hallab7
- Project repository: https://github.com/passport
- Demo URL:

## Current Status

- **`did:ckb` specification exists.** WIP-01 defines creation, update, deactivation, resolution,
  DID Metadata Cell structure, identifier generation, and DID metadata fields.
- **SDK support is shipping.** `@ckb-ccc/did-ckb` is published on npm. The latest registry tag was
  verified as `0.2.9` on 2026-09-04.
- **Advanced CCC work was merged.** PR #376 to `ckb-devrel/ccc` was merged on 2026-06-20. It added
  DID identifier helpers, resolver support, history walk, and `did:plc` migration support.
- **Passport scope is drafted.** A compact project brief and proof-of-concept specification exist
  locally. This proposal turns that design into a grant-ready, milestone-based implementation plan.
- **No production Passport implementation is claimed yet.** The first milestone deliberately
  includes feasibility gates for passkeys and wallet-message signing before the project commits to a
  final authentication mode.

## Application Design

This section explains how Passport actually functions.

### 6.1 Functional Overview

A user's flow through Passport:

1. **Own a `did:ckb`.** The user creates or already owns a DID Metadata Cell. DID creation can
   happen through Vellum or another DID application and is not a login event.
2. **Bind an authentication key.** The DID document contains a `verificationMethods` entry. The
   preferred key is a passkey P-256 key if feasible; wallet-held secp256k1 is the fallback.
3. **Open a relying application.** The user clicks Sign in with CKB DID.
4. **Receive a challenge.** The application creates a human-readable, domain-bound login challenge
   with DID, key ID, URI, nonce, issued time, expiration time, network, and version.
5. **Sign the challenge.** The user signs with the selected verification method key. In passkey
   mode this is a WebAuthn assertion. In wallet mode this is a wallet message signature.
6. **Verify the proof.** The server resolves the DID, confirms it is live, reads the selected
   verification method, validates the challenge fields, rejects replayed or expired nonces, and
   verifies the signature.
7. **Create a DID session.** The application stores a session bound to the DID and key ID. It does
   not need to store a wallet address.

On-chain vs off-chain:

The DID Metadata Cell and DID document are on chain. Login challenges, nonce storage, WebAuthn
assertions, verifier checks, and web sessions are off chain. No transaction is created during login.

### 6.2 Architecture & Design

Protocol components:

- **SIWD specification.** A Sign-In with CKB DID message format modelled on the proven shape of
  EIP-4361, adapted for `did:ckb`.
- **Canonical message builder and parser.** The verifier reconstructs and checks the message
  byte-for-byte so relying parties do not accept ambiguous prompts.
- **Proof envelope.** A structured payload containing the message, DID, key ID, mode, signature,
  and WebAuthn fields when applicable.

Verifier components:

- **DID resolver integration.** Converts a `did:ckb` identifier into type script args, queries live
  cells, decodes Molecule `DidCkbData`, decodes DAG-CBOR, and reads `verificationMethods`.
- **Challenge validation.** Checks domain, URI origin, network, version, nonce, issued time,
  expiration time, DID syntax, and selected key ID.
- **Signature verification.** Supports passkey/WebAuthn P-256 verification if feasible and
  wallet-message secp256k1 verification as the fallback.
- **Fail-closed deactivation handling.** A deactivated or unresolved DID cannot authenticate.
- **Test vectors.** Positive and negative fixtures covering wrong domain, wrong URI origin,
  expired challenge, future issued time, replayed nonce, missing key ID, unsupported key type,
  WebAuthn origin mismatch, wrong challenge hash, user-present bit failure, and deactivated DID.

Developer components:

- **Browser client.** Requests challenges, invokes passkey or wallet signing, and submits proofs.
- **Server middleware.** Express or Fastify middleware for issuing challenges and verifying proofs.
- **CCC connector or adapter.** A developer-facing integration path for applications already using
  CCC patterns but wanting a DID session rather than an address session.
- **Demo app.** A minimal relying party that shows the session state and proves no address is
  required for login.

Planned developer surface:

```ts
const session = await passport.connect({
  network: "ckb-testnet",
  keyId: "auth-1",
});
```

```ts
app.post("/login/verify", verifyCkbDidLogin({
  network: "ckb-testnet",
  expectedOrigin: "https://app.example",
}));
```

Key CKB features used:

Cell model, lock scripts, DID Metadata Cells, `did:ckb` identifier args, Molecule cell-data
encoding, DAG-CBOR DID metadata encoding, live-cell resolution, deactivation by consuming the DID
cell, and the existing `@ckb-ccc/did-ckb` package.

External dependencies:

`@ckb-ccc/core`, `@ckb-ccc/did-ckb`, `@ipld/dag-cbor`, `@noble/curves`, WebAuthn browser APIs, and
standard Node.js web middleware tooling.

Open source commitment:

All protocol text, verifier code, browser client code, middleware, demo application, test vectors,
and integration documentation will be published under an open-source license.

### 6.3 Design Rationale

**DID session, not wallet session.** Passport uses `verificationMethods` to authenticate, not the
DID control lock and not the user's main wallet address. This is the central separation the project
exists to make practical.

**Use an established message pattern.** EIP-4361 has already normalized domain-bound, nonce-bound,
human-readable login challenges in another ecosystem. Passport borrows the shape while defining CKB
and DID-specific fields explicitly.

**Passkey first, wallet fallback.** Passkeys make DID login usable for people who do not want to
install a wallet before joining a community app. The proposal still includes a wallet fallback
because passkey binding to current DID tooling must be proven, not assumed.

**Fail closed on identity state.** If a DID is deactivated, unresolved, expired, replayed, or signed
by a retired key, the verifier rejects the login. This matters more than a smooth happy path.

**Small packages, visible test vectors.** The core verifier and message format should be easy to
review. Test vectors make independent implementations possible and keep integration behavior from
becoming a black box.

**No database of identity truth.** Passport does not become an identity registry. It reads the DID
document from CKB and helps relying applications verify login proofs.

### 6.4 Fee Model And Sustainability

Passport does not charge protocol fees and does not introduce a token.

Sustainability comes from three sources:

1. **Open infrastructure.** The core specification, verifier, and packages are public goods for CKB
   applications.
2. **Normal application hosting.** Relying applications host their own sessions and nonce stores.
   Passport does not need central infrastructure to mediate every login.
3. **Future services, outside this grant.** Optional future work could include hosted demos,
   integration support, managed relying-party dashboards, or formal audits. None of those are
   required for the protocol to work and none are part of this funding request.

Users still need capacity to create a DID Metadata Cell. That cost belongs to DID creation, not to
Passport login. Once a DID exists, login itself creates no transaction and requires no gas.

## Key Benefits For CKB

- **A practical use case for `did:ckb`.** Passport turns the DID method from infrastructure into a
  relying-party login experience.
- **Safer authentication defaults.** Applications can recognize users without asking for a
  spend-capable wallet session as the first step.
- **Less unnecessary address disclosure.** DID login avoids making wallet address collection a side
  effect of ordinary account access.
- **Account continuity across key rotation.** Users can rotate verification method keys without
  becoming new accounts everywhere.
- **Developer tooling.** Middleware, browser client code, and a CCC connector reduce integration
  friction for CKB application builders.
- **Foundation for identity-consuming apps.** Reputation systems, claim dashboards, forums,
  community tools, and governance experiments all need a login surface that can consume `did:ckb`.
- **Real integration testing for the DID stack.** Two relying-party integrations will expose rough
  edges in the current tooling and produce reusable fixes or documentation.

## Detailed Deliverables & Milestones

### Initial Funding

- **ETA:** Week 0
- **Budget:** $1,500 USD (25%)
- **Deliverables:**
  - Proposal accepted.
  - Public repository created or selected.
  - Public roadmap and GitHub project board live.
  - Milestone reviewer expectations confirmed on the discussion thread.
  - Week-1 feasibility checklist published.

### Milestone 1: Protocol, Verifier, And Feasibility Gates

- **ETA:** Weeks 1-4 from initial funding
- **Budget:** $1,500 USD (25%)
- **Deliverables:**
  - Sign-In with CKB DID specification published.
  - Canonical message builder and parser implemented.
  - DID resolver path implemented against current `@ckb-ccc/did-ckb` tooling where possible.
  - Reference verifier validates domain, URI origin, nonce, expiry, network, DID syntax, key ID,
    and signature.
  - Passkey/WebAuthn feasibility gate completed and documented.
  - Wallet-message signing format confirmed and documented.
  - Demo site shows a successful DID login and rejected replay.
  - Threat model draft published.
  - Test-vector suite started with positive and negative cases.

### Milestone 2: Key Lifecycle And Developer Packages

- **ETA:** Weeks 5-8 from initial funding
- **Budget:** $1,500 USD (25%)
- **Deliverables:**
  - Key rotation behavior implemented and documented.
  - Sessions signed by retired verification methods become invalid.
  - New logins after key rotation work against the same DID account.
  - DID deactivation fails closed.
  - Multisig or recovery-lock reference flow documented.
  - DID-cell lock hygiene guidance published.
  - Express or Fastify middleware implemented.
  - Browser client package implemented.
  - CCC connector or adapter implemented.
  - Packages published to npm or made installable from a public repository.

### Milestone 3: Relying-Party Integrations, Validation, And Handoff

- **ETA:** Weeks 9-12 from initial funding
- **Budget:** $1,500 USD (25%)
- **Deliverables:**
  - Nervos Talk Discourse plugin or equivalent CKB community relying-party integration.
  - Second relying-party integration outside the applicant's own demo.
  - Integration guide based on both relying-party implementations.
  - Demo recordings for login, replay rejection, key rotation, deactivation, and recovery.
  - Test-vector suite completed and published.
  - Final threat model published.
  - Maintenance plan and handoff notes published.
  - Testnet validation pass across all deliverables.

Acceptance criteria per milestone:

Each milestone closes only when the named source code or documentation is public, the related demo
or package can be run from published instructions, and a designated reviewer posts an approval
comment on the proposal thread. Reviewer designations will be confirmed during the discussion phase
before voting begins.

The scope is deliberately concentrated. Credentials, payments, selective disclosure, ZK
unlinkability, mainnet fund movement, and DAO voting-rule changes are out of scope.

## Budget Breakdown

The $6,000 USD equivalent funds 12 weeks of solo developer work focused on making `did:ckb` usable
as an application login primitive. The categories below mirror the CFDAO template structure.

Development costs: $5,000

- Protocol specification, canonical message format, verifier, resolver integration, and test
  vectors: ~$1,600.
- Passkey/WebAuthn path, wallet fallback, signature verification, and security checks: ~$1,100.
- Key rotation, revocation, deactivation, recovery flow, and DID-cell lock hygiene: ~$900.
- Middleware, browser client, CCC connector, examples, and package release work: ~$900.
- Relying-party integration support and demo application work: ~$500.

Security audit: $0

- No formal third-party audit is included in this proposal. The verifier and packages will ship
  testnet-first with public source, test vectors, and community review. A formal audit can be a
  future funding request if Passport becomes load-bearing for high-value applications.

Infrastructure / hosting: $300

- Demo hosting, preview deployments, testnet application hosting, and basic domain or DNS costs if
  needed.

Project management: absorbed in development

- Solo developer delivery keeps project management overhead minimal and folded into the development
  budget.

Documentation & community engagement: $500

- Specification writing, integration guide, threat model, demo recordings, forum status updates,
  and community support during the build period.

Contingency: $200

- Small reserve for unexpected testnet, hosting, domain, or package-publication costs.

Total: $6,000

Out-of-budget items are formal security audits, paid marketing or business-development outreach,
managed identity hosting, long-term maintenance beyond this grant's commitment, and mainnet
promotion of any component that reviewers consider security-sensitive.

## Out-of-Scope / Future Funding Needs

The following are deliberately out of scope for this grant:

- **Credential issuance.** Vellum and other identity tools can issue claims. Passport verifies DID
  login proofs.
- **Selective disclosure and zero-knowledge unlinkability.** These are valuable future directions
  but not required for relying-party DID login.
- **Cross-site unlinkability.** If two sites both receive the same DID, they can correlate it.
  Preventing that requires a different privacy design.
- **Payment and tipping flows.** Fiber payments, tipping, and spending are separate application
  flows.
- **Changing DAO vote weighting or governance meta-rules.** Passport may become useful to future
  governance tools, but this proposal does not alter DAO rules.
- **Mainnet fund movement.** Mainnet DID resolution may be read, but no mainnet funds are moved.
- **Formal third-party audit.** Public review and testnet validation are included. Audit funding is
  future work.
- **Paid marketing or BD outreach.** The proposal funds implementation and integration, not paid
  promotion.

## Risk & Mitigation

- **Passkey binding may not work with current DID tooling.** This is resolved in week 1. If it
  fails, Passport ships wallet mode and documents the blocker clearly.
- **CKB wallets may not share a consistent personal-message signing format.** The wallet fallback
  is tested early against CCC-compatible tooling, and the supported format is pinned in the spec.
- **DID-cell lock linkage can reduce privacy.** Passport documents separate-lock defaults and adds
  resolver warnings where feasible.
- **Relying-party adoption may be harder than the demo suggests.** The project includes two actual
  integrations and starts recruiting the second relying party during the first milestone.
- **Resolver trust may depend on one RPC or indexer.** The verifier documents this assumption and
  fails closed. Light-client verification is future work.
- **Authentication bugs are security-sensitive.** The implementation uses small packages, explicit
  negative test vectors, fail-closed behavior, public review, and testnet-first deployment.
- **Solo developer execution risk.** The proposal is split into independently reviewable
  deliverables, with public code and milestone reviewer acknowledgement.
- **CKB price volatility affecting the budget.** The grant amount is requested as a USD equivalent.
  The CKB amount for each disbursement is calculated at pay time using the then-current price.

Maintenance commitment in this grant:

Passport will be maintained for at least three months following the final milestone. During that
period the applicant will respond to integration issues, fix security-relevant verifier bugs,
update examples for breaking changes in `@ckb-ccc/did-ckb` or CCC, answer developer questions on
the proposal thread, and publish at least one post-project status update summarizing adoption,
blockers, and next steps.

## Closing / Call To Action

The `did:ckb` stack is ready for real relying-party usage. Passport funds the missing application
layer: sign in with a DID, verify it safely, rotate keys without losing accounts, and integrate with
existing CKB applications without treating wallet addresses as the default identity layer.

This proposal is intentionally focused. It does not ask the DAO to fund a broad identity platform.
It asks for a 12-week, testnet-first public beta that makes an existing CKB primitive useful to
forums, community apps, reputation tools, and future governance experiments.

Feedback, reviewer nominations, and relying-party integration interest are welcome in the discussion
thread.

## Supporting Links

- WIP-01 `did:ckb` Method Specification:
  https://github.com/web5fans/web5-wips/blob/master/01.md
- `@ckb-ccc/did-ckb` on npm:
  https://www.npmjs.com/package/@ckb-ccc/did-ckb
- SDK PR #376 merged into CCC:
  https://github.com/ckb-devrel/ccc/pull/376
- `web5fans/did-ckb` repository:
  https://github.com/web5fans/did-ckb
- CKB type-id documentation:
  https://docs.nervos.org/docs/script/type-id
- EIP-4361 Sign-In with Ethereum:
  https://eips.ethereum.org/EIPS/eip-4361
- W3C DID Core:
  https://www.w3.org/TR/did-1.0/
- W3C WebAuthn Level 3:
  https://www.w3.org/TR/webauthn-3/
- `did:key` method:
  https://w3c-ccg.github.io/did-method-key/
- DAG-CBOR specification:
  https://ipld.io/specs/codecs/dag-cbor/spec/
- CFDAO rules and process:
  https://talk.nervos.org/t/ckb-community-fund-dao-rules-and-process/6874

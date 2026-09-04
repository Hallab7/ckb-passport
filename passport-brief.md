# Passport - Project Concept Brief

**Proposed funding:** $6,000 USD equivalent
**Development period:** 12 weeks
**Network:** CKB + `did:ckb`

## Summary

Passport is an open-source authentication layer that lets CKB applications sign users in with a
`did:ckb` identity instead of a wallet address.

Today, most CKB applications use Connect Wallet as the default login flow. That means the account
identifier an application receives is usually the same address that controls assets. Passport
separates application login from spending authority by using `did:ckb` verification methods as
authentication keys.

The project creates a practical use case for `did:ckb`: websites and applications can recognize a
portable CKB identity, while users can sign in without exposing a wallet address or granting any
transaction authority. The first version is testnet-first, with mainnet DID resolution kept
read-only and no mainnet fund movement.

## Problem

CKB applications commonly authenticate users through wallet connection. This creates several
problems:

- login is tied to a key that may also move funds;
- a wallet address gives applications a lookup key into public on-chain activity;
- losing or rotating a wallet key can make a user appear to be a new person across applications;
- existing CKB tooling does not provide a standard DID-based login protocol;
- `did:ckb` exists as infrastructure, but there are few relying-party applications that actually
  accept it.

These issues matter most for applications that want identity, reputation, claims, governance
participation, or account continuity without forcing every user interaction through a spend-capable
wallet key.

## Proposed solution

Passport provides a sign-in flow for CKB applications using `did:ckb`:

1. A user creates or already owns a `did:ckb` identity.
2. The DID document contains one or more verification methods that can speak for the DID.
3. An application presents a domain-bound login challenge.
4. The user signs the challenge with a verification method key, such as a passkey or wallet-held
   authentication key.
5. The verifier resolves the DID, checks that it is live, reads the selected verification method,
   validates the signature, and rejects expired or replayed challenges.
6. The application issues a normal session tied to the DID rather than to a wallet address.

The first version will support:

- a Sign-In with CKB DID message format inspired by EIP-4361;
- a reference verifier for DID resolution, challenge validation, and signature verification;
- passkey-based authentication where feasible;
- a wallet-based fallback authentication mode;
- key rotation, revocation, and deactivation behavior;
- middleware and browser client packages for application developers;
- two relying-party integrations that demonstrate real adoption.

## Why CKB and `did:ckb`

**CKB** provides the on-chain foundation for persistent, user-controlled identity. A `did:ckb`
identifier is backed by a DID Metadata Cell whose lock authorizes updates, while the DID document
can contain separate verification methods for authentication.

**`did:ckb`** is already specified, deployed, and available through existing ecosystem packages. The
missing piece is an adoption layer that makes it easy for applications to accept DID sessions
instead of wallet-address sessions.

**Passkeys and verification methods** allow login to be separated from spending authority. A login
signature should prove control of an identity key, not authorize a transaction or expose a user's
asset position as a side effect.

## Public-beta deliverables

- Open-source Sign-In with CKB DID specification.
- Reference verifier for `did:ckb` login challenges.
- DID resolver integration for live-cell lookup and document parsing.
- Replay protection, nonce handling, expiry validation, and domain binding.
- Passkey authentication path with WebAuthn verification, if confirmed feasible.
- Wallet-message authentication fallback.
- Key rotation, revocation, deactivation, and recovery behavior.
- DID-cell lock hygiene guidance to reduce accidental address linkage.
- Express or Fastify middleware and browser client package.
- CCC connector so existing CKB applications can request a DID session.
- Published npm packages and developer documentation.
- Demo application showing login without wallet-address disclosure.
- Nervos Talk or comparable relying-party integration.
- Second relying-party integration outside the author's own demo.
- Recorded end-to-end demos for login, replay rejection, key rotation, and recovery.
- Threat model covering replay, phishing, session fixation, resolver trust, lock leakage, and
  deactivation.
- Three months of maintenance and integration support.

## Proposed budget

| Item | Amount |
|---|---:|
| Protocol specification and reference verifier | $1,500 |
| Key lifecycle, rotation, revocation, and recovery | $1,500 |
| Developer packages, CCC connector, and integration docs | $1,500 |
| Relying-party integrations, demos, and maintenance | $1,500 |
| **Total** | **$6,000** |

The budget follows four equal milestones over 12 weeks. Each milestone is tied to a usable
deliverable: the login protocol and verifier, key lifecycle behavior, developer adoption packages,
and two public relying-party integrations.

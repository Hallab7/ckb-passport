export {
  ConfigError,
  getDidKnownScript,
  loadPassportPocConfig,
} from "./config.js";
export type {
  CkbHashType,
  ConfigEnv,
  PassportPocConfig,
  PassportPocNetwork,
} from "./config.js";
export { verifySiwdKeyChecks } from "./key-checks.js";
export type {
  VerifySiwdKeyChecksOptions,
  VerifySiwdKeyChecksResult,
} from "./key-checks.js";
export { generateNonce, InMemoryNonceService } from "./nonce.js";
export type {
  NonceConsumeResult,
  NonceRecord,
  NonceServiceOptions,
} from "./nonce.js";
export { verifySiwdMessageChecks } from "./proof.js";
export type {
  BaseSiwdProofEnvelope,
  NonceConsumer,
  SiwdProofEnvelope,
  SiwdProofMode,
  SoftwareSiwdProofEnvelope,
  VerifySiwdMessageChecksFailureCode,
  VerifySiwdMessageChecksOptions,
  VerifySiwdMessageChecksResult,
  WebAuthnSiwdProofEnvelope,
} from "./proof.js";
export { evaluateSiwdVector } from "./vector-runner.js";
export { siwdFailureStep } from "./failure-step.js";
export type {
  SiwdTestVector,
  SiwdVectorEvaluation,
  SiwdVectorExpectation,
  SiwdVectorNonceState,
} from "./vector-runner.js";
export { verifySiwdProof } from "./verification.js";
export type {
  VerifySiwdProofFailureCode,
  VerifySiwdProofOptions,
  VerifySiwdProofResult,
} from "./verification.js";
export { generateSessionToken, InMemorySessionService } from "./session.js";
export type {
  IssuedPassportSession,
  PassportSession,
  SessionIssueOptions,
} from "./session.js";
export { buildDidTypeScript, resolveDidCell } from "./resolver.js";
export type { DidCellResolution, ResolveDidCellOptions } from "./resolver.js";
export { checkDidVerificationMethodRoundTrip } from "./round-trip.js";
export type {
  CheckDidVerificationMethodRoundTripOptions,
  DidVerificationMethodRoundTrip,
} from "./round-trip.js";
export {
  decodeDidDocumentFromCell,
  validateDidCkbDocument,
} from "./document.js";
export type { DidCkbDocument, DidDocumentDecodeResult } from "./document.js";
export {
  completePreparedDidVerificationMethodUpdateFee,
  prepareDidVerificationMethodUpdate,
  submitDidVerificationMethodUpdate,
  upsertP256VerificationMethod,
} from "./did-update.js";
export type {
  CompletePreparedDidVerificationMethodUpdateFeeOptions,
  DidVerificationMethodUpdateFeeResult,
  DidTransferFunction,
  DidVerificationMethodUpdateFailureCode,
  DidVerificationMethodUpdateResult,
  PreparedDidVerificationMethodUpdate,
  PreparedDidVerificationMethodUpdateSuccess,
  PrepareDidVerificationMethodUpdateOptions,
  SubmittedDidVerificationMethodUpdate,
  SubmitDidVerificationMethodUpdateOptions,
} from "./did-update.js";
export { selectVerificationMethod } from "./verification-method.js";
export type { VerificationMethodSelection } from "./verification-method.js";
export {
  verifySoftwareSignature,
} from "./software-verify.js";
export type {
  VerifySoftwareSignatureOptions,
  VerifySoftwareSignatureResult,
} from "./software-verify.js";
export { verifyWebAuthnSignature } from "./webauthn-verify.js";
export type {
  VerifyWebAuthnSignatureOptions,
  VerifyWebAuthnSignatureResult,
} from "./webauthn-verify.js";

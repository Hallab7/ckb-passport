export function siwdFailureStep(code: string): string {
  const steps: Record<string, string> = {
    domain_mismatch: "2",
    uri_origin_mismatch: "3",
    version_invalid: "4",
    network_mismatch: "5",
    message_expired: "6",
    issued_at_too_far_future: "6",
    nonce_unknown: "7",
    nonce_expired: "7",
    nonce_consumed: "7 (second submission)",
    nonce_reserved: "7",
    did_invalid: "8",
    did_not_found_or_deactivated: "9d",
    did_ambiguous: "9e",
    verification_method_missing: "10",
    verification_method_invalid: "11",
    signature_invalid: "12 (parse)",
    signature_high_s: "12a / 12h",
    curve_mismatch: "12b precondition",
    client_data_type_invalid: "12c",
    client_data_origin_mismatch: "12d",
    challenge_mismatch: "12e",
    rp_id_hash_mismatch: "12f",
    user_present_required: "12g",
    signature_verification_failed: "12a / 12h",
  };
  return steps[code] ?? "1";
}

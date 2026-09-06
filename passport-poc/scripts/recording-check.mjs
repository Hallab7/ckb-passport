import { existsSync, statSync } from "node:fs";

const checkOnly = process.argv.includes("--check");
const defaultRecordingPath = "evidence/passport-poc-recording.mp4";
const recordingPath = process.env.CKB_PASSPORT_RECORDING ?? defaultRecordingPath;
const requiredScenes = [
  "tests passing",
  "auth-key registration or exact H3 failure",
  "DID update or exact update blocker",
  "session contents after sign-in",
  "identical proof replay rejected",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run recording:verify",
        recordingPath,
        requiredScenes,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!existsSync(recordingPath)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "recording_missing",
        message: "recording artifact was not found",
        recordingPath,
        requiredScenes,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const stats = statSync(recordingPath);
if (!stats.isFile() || stats.size === 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "recording_invalid",
        message: "recording artifact must be a non-empty file",
        recordingPath,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      recordingPath,
      sizeBytes: stats.size,
      requiredScenes,
    },
    null,
    2,
  ),
);

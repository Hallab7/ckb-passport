import { spawnSync } from "node:child_process";

const checkOnly = process.argv.includes("--check");
const port = Number.parseInt(
  process.env.CKB_PASSPORT_DEMO_PORT ?? process.env.PORT ?? "3000",
  10,
);
const listenPort = Number.isFinite(port) ? port : 3000;
const expectedOrigin =
  process.env.SIWD_EXPECTED_ORIGIN ?? `http://localhost:${listenPort}`;

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run demo",
        behavior: "builds the workspace, then starts the Next.js demo on localhost",
        port: listenPort,
        expectedOrigin,
        network: process.env.CKB_PASSPORT_NETWORK ?? "ckb-testnet",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const env = {
  ...process.env,
  PORT: String(listenPort),
  CKB_PASSPORT_DEMO_PORT: String(listenPort),
  SIWD_EXPECTED_ORIGIN: expectedOrigin,
};

run("npm run build", env);
run(`npm run dev -w @ckb-passport/demo -- --port ${listenPort}`, env);

function run(command, env = process.env) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

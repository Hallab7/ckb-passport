import { spawnSync } from "node:child_process";

run("npm run build -w @ckb-passport/siwd-core");
run("npm run test --workspaces --if-present");

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}


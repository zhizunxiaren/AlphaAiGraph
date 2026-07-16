import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitestEntry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(process.execPath, [
  vitestEntry,
  "run",
  "src/knowledge/graphScale.benchmark.test.ts",
  "--testTimeout=600000"
], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, RUN_GRAPH_SCALE_BENCHMARK: "1" },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

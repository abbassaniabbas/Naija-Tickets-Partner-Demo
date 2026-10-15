import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(resolve(dir, d.name)) : [resolve(dir, d.name)],
  );
}
for (const path of [
  ...files(resolve(root, "server")),
  ...files(resolve(root, "api")),
  ...files(resolve(root, "scripts")),
  ...files(resolve(root, "public")).filter((p) => p.endsWith(".js")),
].filter((p) => /\.(mjs|js)$/.test(p)))
  execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
for (const path of files(resolve(root, "public")).filter((p) => /\.(html|css|js|svg)$/.test(p))) {
  const source = readFileSync(path, "utf8");
  if (
    /nt_(test|live)_[a-f0-9]{32}_[A-Za-z0-9_-]{43}/.test(source) ||
    [
      "NAIJA_TEST_API_KEY",
      "DEMO_SESSION_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "PAYSTACK_SECRET_KEY",
      "process.env",
    ].some((marker) => source.includes(marker))
  )
    throw Error("Server credential marker in public asset: " + relative(root, path));
  for (const name of ["NAIJA_TEST_API_KEY", "DEMO_SESSION_SECRET"])
    if (process.env[name]?.length >= 20 && source.includes(process.env[name]))
      throw Error("Secret found in public asset.");
}
const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
if (config.outputDirectory !== "public" || !config.functions["api/index.mjs"])
  throw Error("Invalid Vercel entrypoint.");
console.log(
  "Build passed: Node modules checked; public assets ready; no server secrets in browser files.",
);

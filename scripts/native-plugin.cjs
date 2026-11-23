const fs = require("node:fs");
const path = require("node:path");
const { verify } = require("./native-plugin/verify.cjs");
const { plan, apply } = require("./native-plugin/sync.cjs");
const repository = path.resolve(__dirname, "..");

function main(args) {
  const [command = "verify", ...flags] = args;
  if (!["verify", "compare", "sync"].includes(command))
    throw new Error("Expected verify, compare or sync");
  const rootIndex = flags.indexOf("--panel");
  const allowed = new Set(["--panel", "--apply"]);
  for (let i = 0; i < flags.length; i++) {
    if (!allowed.has(flags[i])) throw new Error(`Unknown option: ${flags[i]}`);
    if (flags[i] === "--panel") i++;
  }
  const plugin = verify(path.join(repository, "integrations/support-center"));
  const catalog = JSON.parse(
    fs.readFileSync(path.join(repository, "native-plugins.json"), "utf8"),
  );
  if (
    catalog.schemaVersion !== 1 ||
    catalog.plugins.length !== 1 ||
    catalog.plugins[0].id !== plugin.manifest.id ||
    catalog.plugins[0].version !== plugin.manifest.version ||
    catalog.plugins[0].distribution !== "source" ||
    catalog.plugins[0].runtime !== "native" ||
    catalog.plugins[0].path !== "integrations/support-center" ||
    catalog.plugins[0].requiresHostIntegration !== true
  )
    throw new Error("Native catalog does not match the plugin");
  console.log(
    `PASS: ${plugin.manifest.id} ${plugin.manifest.version}, ${plugin.lock.files.length} source files, PL/EN/DE, migration inventory, integrity`,
  );
  if (command === "verify") return;
  if (rootIndex < 0 || !flags[rootIndex + 1])
    throw new Error("--panel PATH is required");
  const proposal = plan(plugin, flags[rootIndex + 1]);
  const changed = proposal.changes.filter(
    (change) => change.state !== "UNCHANGED",
  );
  for (const change of changed) console.log(`${change.state}: ${change.path}`);
  console.log(
    `Source plan: ${proposal.changes.length - changed.length} unchanged, ${changed.length} differences`,
  );
  if (command === "compare" && changed.length)
    throw new Error("Panel source differs from this plugin snapshot");
  if (command === "sync" && flags.includes("--apply")) {
    apply(plugin, proposal);
    console.log(
      "PASS: Source synchronized; no database operations or application processes were started.",
    );
  } else if (command === "sync")
    console.log(
      "Read-only plan. Use --apply only after reviewing differences.",
    );
}
try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

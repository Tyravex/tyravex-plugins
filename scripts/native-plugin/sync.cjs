const fs = require("node:fs");
const path = require("node:path");
const { digest, inside } = require("./files.cjs");

function plan(plugin, panelRoot) {
  const root = fs.realpathSync(panelRoot);
  for (const check of plugin.lock.hostChecks) {
    const file = inside(root, check.path);
    if (
      !fs.existsSync(file) ||
      !fs.readFileSync(file, "utf8").includes(check.contains)
    )
      throw new Error(
        `Missing host integration: ${check.path} (${check.contains})`,
      );
  }
  const receiptPath = inside(
    root,
    `local-data/native-plugins/${plugin.manifest.id}.json`,
  );
  const receipt = fs.existsSync(receiptPath)
    ? JSON.parse(fs.readFileSync(receiptPath, "utf8"))
    : null;
  if (receipt && receipt.pluginId !== plugin.manifest.id)
    throw new Error("Receipt belongs to another plugin");
  const previous = new Map(
    (receipt?.files || []).map((file) => [file.path, file.sha256]),
  );
  const changes = plugin.lock.files.map((file) => {
    const target = inside(root, file.path);
    const current = fs.existsSync(target)
      ? digest(fs.readFileSync(target))
      : null;
    return {
      ...file,
      target,
      current,
      state:
        current === file.sha256
          ? "UNCHANGED"
          : current === null
            ? "CREATE"
            : current === previous.get(file.path)
              ? "UPDATE"
              : "CONFLICT",
    };
  });
  return { root, receiptPath, changes };
}
function apply(plugin, proposal) {
  if (proposal.changes.some((change) => change.state === "CONFLICT"))
    throw new Error(
      "Local changes conflict with this plugin. No files were written.",
    );
  // Recheck the entire proposal before writing any source file.
  const contents = new Map();
  for (const change of proposal.changes) {
    inside(proposal.root, change.path);
    const current = fs.existsSync(change.target)
      ? digest(fs.readFileSync(change.target))
      : null;
    if (current !== change.current)
      throw new Error("Panel changed since the synchronization plan");
    const source = fs.readFileSync(inside(plugin.panel, change.path));
    if (digest(source) !== change.sha256)
      throw new Error("Plugin source changed since verification");
    contents.set(change.path, source);
  }
  for (const change of proposal.changes) {
    if (change.state === "UNCHANGED") continue;
    const target = inside(proposal.root, change.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents.get(change.path));
  }
  fs.mkdirSync(path.dirname(proposal.receiptPath), { recursive: true });
  fs.writeFileSync(
    proposal.receiptPath,
    JSON.stringify(
      {
        pluginId: plugin.manifest.id,
        version: plugin.manifest.version,
        snapshotSha256: plugin.lock.snapshotSha256,
        files: plugin.lock.files,
      },
      null,
      2,
    ) + "\n",
  );
}
module.exports = { plan, apply };

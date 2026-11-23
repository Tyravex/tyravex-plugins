const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { digest, inside } = require("../../scripts/native-plugin/files.cjs");
const {
  load,
  verify,
  verifyTranslations,
} = require("../../scripts/native-plugin/verify.cjs");
const { plan, apply } = require("../../scripts/native-plugin/sync.cjs");
const repository = path.resolve(__dirname, "../..");
const source = path.join(repository, "integrations/support-center");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tyravex-native-test-"));
  const plugin = path.join(root, "plugin");
  fs.cpSync(source, plugin, { recursive: true });
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("tyravex-native-test-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, plugin };
}
function host(plugin, root) {
  const panel = path.join(root, "host");
  fs.mkdirSync(panel);
  for (const check of plugin.lock.hostChecks) {
    const target = inside(panel, check.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (plugin.lock.files.some(file => file.path === check.path)) {
      fs.copyFileSync(path.join(plugin.panel, check.path), target);
    } else fs.appendFileSync(target, `${check.contains}\n`);
  }
  return panel;
}

test("official native catalog matches the reviewed source package and declared migrations", () => {
  const plugin = verify(source);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(repository, "native-plugins.json"), "utf8"),
  );
  assert.equal(catalog.schemaVersion, 1);
  const entry = catalog.plugins.find(
    (value) => value.id === plugin.manifest.id,
  );
  assert.equal(entry.version, plugin.manifest.version);
  assert.equal(entry.distribution, "source");
  assert.equal(entry.runtime, "native");
  assert.equal(entry.requiresHostIntegration, true);
  assert.equal(entry.path, "integrations/support-center");
});
test("all source files match their checksums and no unlisted files can ship", (t) => {
  const { plugin } = fixture(t);
  fs.appendFileSync(
    path.join(plugin, "panel/packages/types/src/support-center/index.ts"),
    "\n// drift\n",
  );
  assert.throws(() => load(plugin), /checksum mismatch/);
});
test("refuses environment files and other files outside the explicit source inventory", (t) => {
  const { plugin } = fixture(t);
  fs.writeFileSync(path.join(plugin, "panel/.env"), "not-a-real-secret");
  assert.throws(() => load(plugin), /Unlisted/);
});
test("refuses traversal, absolute paths and symlinks before writing", (t) => {
  const { root } = fixture(t);
  for (const file of [
    "../outside",
    "apps/../outside.ts",
    "/outside.ts",
    "D:/outside.ts",
    "apps\\outside.ts",
    "apps//outside.ts",
  ])
    assert.throws(() => inside(root, file), /Unsafe|escapes/);
  const link = path.join(root, "linked");
  fs.symlinkSync(
    os.tmpdir(),
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => inside(root, "linked/outside.ts"),
    /Links are not allowed/,
  );
  fs.unlinkSync(link);
});
test("rejects missing language keys and changed interpolation variables", (t) => {
  const { plugin } = fixture(t);
  const model = load(plugin);
  const file = path.join(
    model.panel,
    "apps/frontend/src/plugins/support-center/locales/de.json",
  );
  const values = JSON.parse(fs.readFileSync(file, "utf8"));
  delete values.title;
  fs.writeFileSync(file, JSON.stringify(values));
  assert.throws(() => verifyTranslations(model), /Translation keys differ/);
  values.title = "Support";
  values.unreadReplies = "Unread {{invalid}}";
  fs.writeFileSync(file, JSON.stringify(values));
  assert.throws(() => verifyTranslations(model), /placeholders differ/);
});
test("dry-run does not write files; apply copies reviewed sources without running database code", (t) => {
  const { root, plugin } = fixture(t);
  const model = verify(plugin);
  const panel = host(model, root);
  const proposal = plan(model, panel);
  assert.ok(proposal.changes.every((change) => ["CREATE", "UNCHANGED"].includes(change.state)));
  assert.ok(proposal.changes.some(change => change.state === "CREATE"));
  assert.ok(!fs.existsSync(path.join(panel, model.lock.files[0].path)));
  apply(model, proposal);
  assert.ok(
    plan(model, panel).changes.every((change) => change.state === "UNCHANGED"),
  );
  assert.equal(
    JSON.parse(fs.readFileSync(proposal.receiptPath)).snapshotSha256,
    model.lock.snapshotSha256,
  );
  const compatible = {
    ...model,
    lock: {
      ...model.lock,
      hostChecks: [{ path: "missing.ts", contains: "Host" }],
    },
  };
  assert.throws(() => plan(compatible, panel), /Missing host integration/);
});
test("preserves local edits and refuses the entire synchronization before writing any file", (t) => {
  const { root, plugin } = fixture(t);
  const model = verify(plugin);
  const panel = host(model, root);
  const edited = path.join(panel, model.lock.files[0].path);
  fs.mkdirSync(path.dirname(edited), { recursive: true });
  fs.writeFileSync(edited, "local edit");
  const proposal = plan(model, panel);
  assert.equal(proposal.changes[0].state, "CONFLICT");
  assert.throws(() => apply(model, proposal), /Local changes conflict/);
  assert.equal(fs.readFileSync(edited, "utf8"), "local edit");
  assert.ok(!fs.existsSync(path.join(panel, model.lock.files[1].path)));
});
test("refuses a stale synchronization plan after a concurrent local edit", (t) => {
  const { root, plugin } = fixture(t);
  const model = verify(plugin);
  const panel = host(model, root);
  const proposal = plan(model, panel);
  const changed = proposal.changes[0].target;
  fs.mkdirSync(path.dirname(changed), { recursive: true });
  fs.writeFileSync(changed, "concurrent edit");
  assert.throws(() => apply(model, proposal), /Panel changed since/);
  assert.equal(fs.readFileSync(changed, "utf8"), "concurrent edit");
});
test("updates previously managed files but refuses local edits after initial synchronization", (t) => {
  const { root, plugin } = fixture(t);
  const model = verify(plugin);
  const panel = host(model, root);
  apply(model, plan(model, panel));
  const first = model.lock.files[0];
  const target = path.join(model.panel, first.path);
  fs.appendFileSync(target, "\n// Reviewed source update\n");
  first.sha256 = digest(fs.readFileSync(target));
  const proposal = plan(model, panel);
  assert.equal(proposal.changes[0].state, "UPDATE");
  apply(model, proposal);
  assert.equal(
    digest(fs.readFileSync(path.join(panel, first.path))),
    first.sha256,
  );
  fs.appendFileSync(path.join(panel, first.path), "\n// Local edit\n");
  assert.equal(plan(model, panel).changes[0].state, "CONFLICT");
});
test("does not copy a plugin source modified after verification", (t) => {
  const { root, plugin } = fixture(t);
  const model = verify(plugin);
  const panel = host(model, root);
  const proposal = plan(model, panel);
  fs.appendFileSync(
    path.join(model.panel, model.lock.files[0].path),
    "\n// Concurrent source edit\n",
  );
  assert.throws(() => apply(model, proposal), /Plugin source changed/);
  assert.ok(!fs.existsSync(proposal.changes[0].target));
});
test("line endings do not report drift across Windows and Linux checkouts", () => {
  assert.equal(digest("first\r\nsecond\r\n"), digest("first\nsecond\n"));
});

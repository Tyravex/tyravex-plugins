const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { digest, inside, list } = require("./files.cjs");

function load(root) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, "source-lock.json"), "utf8"),
  );
  assert.equal(manifest.id, "tyravex.support-center");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.runtime, "native");
  assert.equal(manifest.type, "integration");
  assert.equal(manifest.database.schema, "plugin_support_center");
  assert.equal(manifest.translations.namespace, `plugin.${manifest.id}`);
  assert.deepEqual(manifest.translations.languages, ["en", "pl", "de"]);
  assert.deepEqual(manifest.permissions, [
    "support:read",
    "support:manage",
    "support:access",
  ]);
  assert.deepEqual(manifest.roleTemplates, [
    { name: "Support", permissions: ["support:read", "support:manage"] },
  ]);
  assert.deepEqual(manifest.database.migrations, [
    "001_initial",
    "002_managed_roles",
    "003_workflow",
    "004_reliability",
  ]);
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.pluginId, manifest.id);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.distribution, "native-source");
  assert.ok(Array.isArray(lock.files) && lock.files.length > 0);
  const paths = lock.files.map((file) => file.path);
  assert.equal(new Set(paths).size, paths.length, "Duplicate source paths");
  assert.deepEqual(paths, [...paths].sort(), "Source paths must be sorted");
  assert.equal(
    createHash("sha256").update(JSON.stringify(lock.files)).digest("hex"),
    lock.snapshotSha256,
    "Source inventory changed",
  );
  const panel = path.join(root, "panel");
  assert.deepEqual(
    list(root),
    [
      ...paths.map((file) => `panel/${file}`),
      "manifest.json",
      "source-lock.json",
      "README.md",
      "LICENSE",
      "docs/implementation.md",
    ].sort(),
    "Unlisted package metadata files",
  );
  assert.deepEqual(list(panel), paths, "Unlisted or missing source files");
  for (const file of lock.files) {
    assert.match(
      file.path,
      /^(?:apps\/(?:backend|frontend)|packages\/types)\//,
    );
    assert.match(file.path, /\.(?:ts|tsx|json|cjs)$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const source = fs.readFileSync(inside(panel, file.path));
    assert.equal(
      digest(source),
      file.sha256,
      `Source checksum mismatch: ${file.path}`,
    );
    assert.ok(
      !/\uFFFD/u.test(source.toString()),
      `Invalid Unicode: ${file.path}`,
    );
    assert.ok(
      !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}/.test(
        source.toString(),
      ),
      `Credential found: ${file.path}`,
    );
  }
  return { root, manifest, lock, panel };
}
function verifyTranslations(plugin) {
  const base = path.join(
    plugin.panel,
    "apps/frontend/src/plugins/support-center/locales",
  );
  const reference = JSON.parse(
    fs.readFileSync(path.join(base, "en.json"), "utf8"),
  );
  for (const language of plugin.manifest.translations.languages) {
    const values = JSON.parse(
      fs.readFileSync(inside(base, `${language}.json`), "utf8"),
    );
    assert.deepEqual(
      Object.keys(values).sort(),
      Object.keys(reference).sort(),
      `Translation keys differ: ${language}`,
    );
    for (const [key, value] of Object.entries(values)) {
      assert.ok(
        typeof value === "string" && value.trim(),
        `Empty translation: ${language}/${key}`,
      );
      assert.ok(
        !/\p{L}\?\p{L}/u.test(value),
        `Invalid translation encoding: ${language}/${key}`,
      );
      assert.deepEqual(
        (value.match(/{{[^}]+}}/g) || []).sort(),
        (reference[key].match(/{{[^}]+}}/g) || []).sort(),
        `Translation placeholders differ: ${language}/${key}`,
      );
    }
  }
}
function verify(root) {
  const plugin = load(root);
  verifyTranslations(plugin);
  const sourceManifest = fs.readFileSync(
    path.join(
      plugin.panel,
      "packages/types/src/support-center/support-center.manifest.ts",
    ),
    "utf8",
  );
  assert.ok(
    sourceManifest.includes(`version: "${plugin.manifest.version}"`),
    "Shared manifest version differs",
  );
  for (const migration of plugin.manifest.database.migrations) {
    const name = migration.replaceAll("_", "-");
    assert.ok(
      plugin.lock.files.some(
        (file) =>
          file.path ===
          `apps/backend/src/plugins/support-center/migrations/${name}.ts`,
      ),
      `Missing migration: ${migration}`,
    );
  }
  return plugin;
}
module.exports = { load, verify, verifyTranslations };

# Tyravex Plugin Marketplace

Official plugin registry for the Tyravex hosting panel.

This repository provides the registry metadata and release packages used by the Tyravex Marketplace.

## Official registry

The official registry is available at:

https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/registry.json

The registry uses schema version `1` and contains a list of published plugins.

Each plugin entry includes:

- `id` — unique plugin identifier.
- `name` — display name.
- `description` — short plugin description.
- `type` — plugin type, such as `language`.
- `version` — plugin version.
- `downloadUrl` — HTTPS URL of the release ZIP.
- `sha256` — SHA-256 checksum of the ZIP archive.
- `category` — Marketplace category.
- `source` — registry source, such as `official`.

## Available plugins

| Plugin               | Version | Type     | Language         |
| -------------------- | ------- | -------- | ---------------- |
| German Language Pack | 1.0.0   | language | German (Deutsch) |

Plugin ID: `tyravex.language.german`

## Repository structure

```text
tyravex-plugins/
├── languages/
│   └── german/
│       ├── manifest.json
│       └── locales/
├── scripts/
│   ├── build-language-plugin.ps1
│   ├── publish-registry.ps1
│   └── verify-registry.ps1
├── dist/
│   └── tyravex.language.german-1.0.0.zip
├── registry.json
└── README-marketplace.md
```

The `dist/` directory contains generated plugin packages and is not tracked by Git.

## Build a plugin package

From the repository root, run:

```powershell
.\scripts\build-language-plugin.ps1 -Language german
```

The generated archive is:

```text
dist/tyravex.language.german-1.0.0.zip
```

## Generate the registry

After building the ZIP, run:

```powershell
.\scripts\publish-registry.ps1
```

This script reads the German language plugin manifest, verifies the expected translation files, calculates the ZIP's SHA-256 checksum, and generates `registry.json`.

The generated download URL follows this format:

```text
https://github.com/Tyravex/tyravex-plugins/releases/download/<plugin-id>-v<version>/<plugin-id>-<version>.zip
```

**Important:** Generating `registry.json` does not upload the ZIP or create a GitHub Release.

## Verify the registry

Run:

```powershell
.\scripts\verify-registry.ps1
```

The verification script checks:

- Registry schema version.
- Required plugin identifiers and versions.
- Duplicate plugin IDs.
- SHA-256 checksum format.
- Presence of the local ZIP.
- SHA-256 checksum against the ZIP.
- HTTPS download URL and expected GitHub Release location.

This verifies local registry consistency. It does not confirm that GitHub Release assets are publicly accessible.

## Publish a new release

Before publishing, ensure that the plugin package and registry pass local verification.

### 1. Build and verify

```powershell
.\scripts\build-language-plugin.ps1 -Language german
.\scripts\publish-registry.ps1
.\scripts\verify-registry.ps1
```

### 2. Publish the registry

Review the changes, then commit and push the registry and documentation to the `main` branch.

### 3. Publish the release ZIP

For German Language Pack v1.0.0:

```powershell
gh release create tyravex.language.german-v1.0.0 `
    ".\dist\tyravex.language.german-1.0.0.zip" `
    --repo Tyravex/tyravex-plugins `
    --title "German Language Pack v1.0.0" `
    --notes "Official German (Deutsch) language pack for Tyravex." `
    --target main
```

Do not recreate an existing release without first reviewing its published assets and version.

### 4. Verify public URLs

Confirm that the following resources are publicly accessible:

- `registry.json` on the `main` branch.
- The ZIP asset attached to the corresponding GitHub Release.

## Tyravex Marketplace integration

In the Tyravex administration panel:

1. Navigate to **Administration → Marketplace**.
2. Find **Tyravex Official** in the repository list.
3. Select **View plugins**.
4. The panel requests the official registry through the Tyravex backend.
5. Published plugins appear with their names, descriptions, types, and versions.

The official repository is managed by Tyravex and cannot be renamed, disabled, or deleted through the community repository management interface.

## Security

Marketplace packages must be distributed over HTTPS and must include a valid SHA-256 checksum.

The registry verification scripts help ensure that metadata matches locally built archives. Release availability and actual installation behavior must be tested separately.

## Maintenance

When publishing a new plugin version:

1. Update the plugin manifest and content.
2. Build a new ZIP package.
3. Generate the registry again.
4. Verify the SHA-256 checksum.
5. Publish the registry and release asset.
6. Test the Marketplace listing and plugin installation.

Do not reuse an existing version for a modified package. Publish a new version instead.

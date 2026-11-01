# Tyravex Plugins

Official plugins and language packs for **Tyravex**.

This repository contains official plugin sources, language packs, build and verification scripts, automated tests, and the public registry used by the Tyravex Marketplace.

## Available plugins

| Plugin                    | Type          | Version | Language         |
| ------------------------- | ------------- | ------- | ---------------- |
| `tyravex.language.german` | Language pack | `1.0.0` | German (Deutsch) |

[German Language Pack v1.0.0](https://github.com/Tyravex/tyravex-plugins/releases/tag/tyravex.language.german-v1.0.0)

## Repository structure

```text
tyravex-plugins/
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Implemented locally
│       ├── prepare-release.yml         # Planned
│       └── publish-release.yml         # Planned
├── languages/
│   └── german/
│       ├── manifest.json
│       └── locales/                    # 19 JSON translation files
├── scripts/
│   ├── build-language-plugin.ps1
│   ├── publish-registry.ps1
│   ├── verify-registry.ps1
│   └── set-plugin-version.ps1          # Planned
├── tests/
│   ├── Test-Translations.ps1
│   ├── Test-Manifest.ps1
│   ├── Test-Archive.ps1
│   └── Test-Registry.ps1
├── dist/                                # Generated; ignored by Git
├── registry.json
├── README.md
├── README-marketplace.md
├── .gitattributes
├── .gitignore
└── LICENSE
```

**Development status:** The four test suites and the GitHub Actions CI workflow have been implemented and passed local checks. The CI workflow has not yet been verified by a run on GitHub Actions. Automated version preparation and release publication remain planned.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7+ for the existing build scripts.
- PowerShell 7 for the GitHub Actions CI environment.
- A valid plugin manifest and all declared translation files.
- Git for repository management.
- A local checkout of the public [Tyravex panel repository](https://github.com/Tyravex/panel) to validate translations against the English source files.
- GitHub CLI (`gh`) for manual release publication, when using the CLI-based publishing workflow.

PowerShell 7 is recommended for local development and CI consistency.

## Building a language plugin

Run from the repository root:

```powershell
.\scripts\build-language-plugin.ps1 -Language german
```

The build script validates the manifest, checks translation file paths and JSON syntax, creates the ZIP package, and verifies its entry list.

Generated archive:

```text
dist/tyravex.language.german-1.0.0.zip
```

The `dist/` directory contains generated artifacts and is ignored by Git.

## Language plugin structure

Language plugins are stored under `languages/<language>/`.

The generated ZIP contains the manifest and translations at its root:

```text
manifest.json
locales/
  adminAudit.json
  adminNodes.json
  ...
  sidebar.json
```

The German Language Pack currently contains 19 translation JSON files. Its manifest declares the plugin ID, type, version, language metadata, and the list of included translation files.

## Tyravex Marketplace

The public official registry is available at:

[Official registry (raw JSON)](https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/registry.json)

It uses `schemaVersion: 1` and lists plugin metadata, download URLs, and SHA-256 checksums.

See [Marketplace documentation](README-marketplace.md) for the registry format and publishing process.

## Generating and verifying the registry

First build the plugin:

```powershell
.\scripts\build-language-plugin.ps1 -Language german
```

Generate the local registry:

```powershell
.\scripts\publish-registry.ps1
```

Verify it against the generated ZIP:

```powershell
.\scripts\verify-registry.ps1
```

The registry verifier checks required metadata, uniqueness of plugin identifiers, manifest consistency, the expected official HTTPS GitHub Release download URL, and whether the local ZIP matches the declared SHA-256 checksum.

**Important:** Running `publish-registry.ps1` writes the local `registry.json`. Building a new ZIP may produce a different SHA-256 checksum even if the plugin version is unchanged. Do not replace registry metadata for an already published release unless it matches the actual immutable release asset.

Local verification does not confirm that the corresponding GitHub Release asset is publicly available.

## Installing a plugin

The German Language Pack can currently be installed manually:

1. Open the Tyravex administration panel.
2. Navigate to **Administration → Plugins**.
3. Select the downloaded plugin ZIP archive.
4. Install the plugin.
5. Enable it if required.
6. Select **Deutsch** in the language switcher.

Direct installation through Marketplace is planned.

## Development

When modifying a language plugin:

1. Edit its JSON translations in `languages/<language>/locales/`.
2. Update the manifest if the declared file list changes.
3. Build the plugin.
4. Run all automated tests.
5. Test the package in Tyravex.
6. Prepare a new version before publishing changed artifacts.

Do not overwrite previously published plugin releases.

## Testing and CI

Four automated test scripts are available in `tests/`:

| Script                  | What it checks                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Test-Translations.ps1` | Translation JSON, keys, values, and placeholders against the panel's English locale files                       |
| `Test-Manifest.ps1`     | Manifest validation and rejection of malformed plugin definitions                                               |
| `Test-Archive.ps1`      | ZIP structure, expected entries, file integrity, and rejection of malformed archives                            |
| `Test-Registry.ps1`     | Registry schema, required metadata, unique IDs, HTTPS release URLs, manifest consistency, and local ZIP SHA-256 |

### Run tests locally

Check out both repositories in the same parent directory, or supply the correct path to your existing panel checkout. For example:

```text
Tyravex/
├── panel/
└── tyravex-plugins/
```

From the root of `tyravex-plugins`, run:

```powershell
.\tests\Test-Translations.ps1 -PanelRoot "..\panel"
.\tests\Test-Manifest.ps1
.\tests\Test-Archive.ps1
.\tests\Test-Registry.ps1
```

The manifest, archive, and registry test suites work with temporary copies of plugin files. They do not publish releases or modify the official registry.

### GitHub Actions CI

The workflow at `.github/workflows/ci.yml` is configured to run on:

- Pushes to `main`.
- Pull requests targeting `main`.
- Manual invocation (`workflow_dispatch`).

CI uses a Windows runner with PowerShell 7. It checks out the public `Tyravex/panel` repository to compare German translations with the English source files, then runs all four test suites.

The workflow has read-only repository permissions and does not create releases, publish packages, update the registry, or push commits.

**CI status:** All four test suites have passed locally: 19 translation files checked, plus 7 manifest tests, 5 archive tests, and 18 registry tests (30 test scenarios total). These results do not yet establish that the workflow has passed on GitHub Actions.

## Versioning and releases

Plugins use Semantic Versioning (`MAJOR.MINOR.PATCH`):

- **PATCH:** backward-compatible corrections.
- **MINOR:** backward-compatible additions.
- **MAJOR:** incompatible changes.

Versions and GitHub Releases are currently managed manually.

Planned automation will support controlled version preparation, test verification, GitHub Release publication, and registry updates.

Passing CI tests alone will not trigger a release.

## Release automation (planned)

The proposed publishing process will:

1. Select a plugin and version increment.
2. Prepare a version-change Pull Request.
3. Validate the manifest, translations, archive, and registry.
4. Require review before publishing.
5. Publish a new immutable GitHub Release.
6. Verify the release asset and update the official registry.

The workflow must reject duplicate release tags, invalid assets, and checksum mismatches.

## Security and integrity

- Plugin download URLs must use HTTPS and match the expected official GitHub Release path.
- Plugin packages must be checked against SHA-256 values.
- Archive entries must match the plugin manifest.
- Invalid metadata or packages must fail verification.
- Previously published releases must not be silently replaced.
- Failed tests must block release publication when release automation is implemented.
- CI uses read-only permissions and must not receive publishing credentials.

## Documentation

- [Marketplace documentation](README-marketplace.md)
- [Official plugin registry](registry.json)
- [German Language Pack manifest](languages/german/manifest.json)

## License

See [LICENSE](LICENSE) for applicable terms.

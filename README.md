# Tyravex Plugins

Official plugins and language packs for Tyravex.

## Available plugins

| Plugin                    | Version | Language         |
| ------------------------- | ------- | ---------------- |
| `tyravex.language.german` | 1.0.0   | German (Deutsch) |

## Repository structure

```text
languages/
  german/
    manifest.json
    locales/
      *.json

scripts/
  build-language-plugin.ps1

dist/
  Generated ZIP packages (not tracked by Git)
```

## Building a language plugin

Requirements:

- Windows PowerShell 5.1 or PowerShell 7+
- A valid plugin manifest
- All translation files referenced by the manifest

From the repository root:

```powershell
.\scripts\build-language-plugin.ps1 -Language german
```

The generated archive will be available at:

```text
dist/tyravex.language.german-1.0.0.zip
```

The build script validates the manifest, checks the translation JSON files and verifies the ZIP structure.

## Installing a plugin

1. Open the Tyravex administration panel.
2. Navigate to Administration → Plugins.
3. Select the generated ZIP archive.
4. Install the plugin.
5. Enable the plugin if necessary.
6. Select Deutsch in the language switcher.

## Language plugin structure

Each language plugin has its own directory under `languages/`.

The ZIP archive must contain the manifest and locale files at its root:

```text
manifest.json
locales/
  adminAudit.json
  adminNodes.json
  ...
  sidebar.json
```

The German plugin contains 19 translation files.

## Development

When updating translations:

1. Edit the JSON files in `languages/<language>/locales/`.
2. Update the manifest if the file list changes.
3. Run the build script.
4. Test the generated ZIP in Tyravex.
5. Update the plugin version when preparing a new release.

## License

See the repository license for applicable terms.

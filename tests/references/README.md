# Translation references

German 1.1.1 is validated against the English catalog in `german/1.1.1/en`: 27 modules and 2,513 keys. This snapshot comes from the local Tyravex panel used to prepare the release; it does not claim to represent the published panel/main branch. It is test data and is never included in the plugin ZIP.

Run `pwsh -File tests/Test-Translations.ps1` and `pwsh -File tests/Test-TranslationValidation.ps1` without a panel checkout to validate a release. Validation remains strict for modules, keys, value types, placeholders, empty strings and damaged encoding. The reference directory is selected by the plugin manifest version; a missing version reference fails validation. Add a new reference when preparing a new plugin version.

For a separate strict compatibility check, pass `-PanelRoot ../panel`. Add `-Advisory` to report only catalog drift as warnings while malformed JSON, missing declared files and resource validation errors remain fatal. CI performs this comparison against panel/main as an advisory job. A difference is reported as a compatibility warning, not suppressed in the release validation.

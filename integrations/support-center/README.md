# Support Center 0.3.0

Official native Support Center sources for Tyravex. This repository is the source of truth for the plugin; the panel keeps a compiled integration copy. The package includes backend services/controllers, host lifecycle and role adapters, reviewed migrations, shared contracts, frontend components/routes, PL/EN/DE translations and tests.

## Features

- Service-bound client tickets and a staff queue with filters, pagination and unread replies.
- Separate ticket pages, an optional staff inbox, conversation/history tabs and responsive service details.
- Assignment, private staff notes, status transitions and typed notifications.
- Both owner-approved staff requests and direct owner grants to the ticket assignee.
- Time-limited, scoped service/file access with immediate server-side revocation checks, revision-checked writes and audit outcomes.
- Protected plugin roles, explicit installation/upgrade, disable and optional plugin-data removal.
- Four checksum-protected migrations in the dedicated PostgreSQL schema `plugin_support_center`.
- In-memory client/staff preview without database writes or agent requests.

## Distribution and compatibility

This is **native source**, not an executable ZIP extension. It requires a Tyravex panel build with the Support Center host integration (RBAC, authenticated sessions, service workspace broker, notifications, i18n and route registration). The public panel main branch may lag behind the locally validated development workspace. No compatibility with an older public panel release is implied.

The sources are listed in `native-plugins.json`, separately from `registry.json`, which remains the installable language/theme catalog. They must not be added to the language ZIP installer. Publishing these sources does not add runtime loading of arbitrary backend/frontend code.

`panel/` mirrors paths in the Tyravex panel checkout. It contains plugin-owned source files and reviewed plugin adapters. Core host services, package-manager dependencies, Prisma configuration, live settings, `.env` files, database contents and local test data are not copied. Shared API types remain under `packages/types/src/support-center` when integrated.

## Verify and synchronize

Requires Node.js 20 or newer. From the plugins repository:

```powershell
node scripts/native-plugin.cjs verify
node --test tests/native/native-plugin.test.cjs
node scripts/native-plugin.cjs compare --panel ../panel
node scripts/native-plugin.cjs sync --panel ../panel
```

`compare` exits nonzero on source drift. `sync` is a read-only plan unless `--apply` is supplied. It checks required host integration markers first. Applying records the managed hashes in the panel's ignored `local-data/native-plugins` directory. It refuses to replace existing differing files without a matching previous receipt, refuses local edits, and never deletes stale files, changes Git state, starts a server or executes database code. Review drift and reconcile source changes before applying an update.

```powershell
node scripts/native-plugin.cjs sync --panel ../panel --apply
```

After approved source synchronization, use the panel's normal builds and tests. Installation/update of plugin database objects remains a separate confirmed action in **Plugins → Support Center**. Synchronizing source files never applies migrations.

## Source archive

```powershell
./scripts/build-native-plugin.ps1
```

This produces `dist/tyravex.support-center-0.3.0-source.zip` and its SHA-256 file. Existing archives are never overwritten. The archive is a source distribution for a reviewed panel build, not a file to upload to the language/theme installer.

## Validation in the compatible panel checkout

```powershell
pnpm --filter @shared/types build
pnpm --filter @shared/types test
pnpm --filter backend build
pnpm --filter backend exec jest --runInBand src/modules/support-center src/modules/plugins/functional src/rbac/plugin-roles
pnpm --filter frontend build
pnpm --filter frontend test src/features/support-center src/shared/i18n/test/functionalPluginResources.test.ts
```

Database/real-agent tests require explicit approval and an isolated test environment. The source archive does not contain credentials or the local cleanup/administration scripts used for live panel tests. See [implementation and security boundaries](docs/implementation.md) for consent, role ownership, retention and installation details.

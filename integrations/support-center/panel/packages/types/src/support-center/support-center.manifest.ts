import type { FunctionalPluginManifest } from "../plugins/functional-plugin.types";
import { SUPPORT_NAMESPACE, SUPPORT_PLUGIN_ID } from "./support-center.types";

export const SUPPORT_CENTER_MANIFEST: FunctionalPluginManifest = {
  schemaVersion: 1,
  id: SUPPORT_PLUGIN_ID,
  version: "0.3.1",
  type: "integration",
  runtime: "native",
  translations: {
    namespace: SUPPORT_NAMESPACE,
    defaultLanguage: "en",
    languages: ["en", "pl", "de"],
  },
  database: {
    schema: "plugin_support_center",
    migrations: [
      "001_initial",
      "002_managed_roles",
      "003_workflow",
      "004_reliability",
    ],
  },
  permissions: ["support:read", "support:manage", "support:access"],
  roleTemplates: [
    { name: "Support", permissions: ["support:read", "support:manage"] },
  ],
};

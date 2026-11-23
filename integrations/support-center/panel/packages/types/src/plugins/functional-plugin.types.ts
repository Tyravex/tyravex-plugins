/** Functional plugins declare capabilities; the host owns routes and authorization. */
export interface FunctionalPluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  type: "integration";
  runtime: "native";
  translations: {
    namespace: `plugin.${string}`;
    defaultLanguage: "en";
    languages: readonly string[];
  };
  database: { schema: string; migrations: readonly string[] };
  permissions: readonly string[];
  roleTemplates?: readonly { name: string; permissions: readonly string[] }[];
}

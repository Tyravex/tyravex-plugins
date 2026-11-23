/** Role ownership belongs to the plugin schema, not to a role's display name. */
export const supportCenterManagedRolesMigration = [
  `CREATE TABLE plugin_support_center.managed_roles (
    role_id text PRIMARY KEY REFERENCES public."Role"(id) ON DELETE CASCADE,
    template_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];

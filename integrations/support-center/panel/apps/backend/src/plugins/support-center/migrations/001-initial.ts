/** Static, reviewed SQL. No database identifiers or SQL are accepted from uploaded packages. */
export const supportCenterInitialMigration = [
  `CREATE SCHEMA IF NOT EXISTS plugin_support_center`,
  `CREATE TABLE IF NOT EXISTS plugin_support_center.migrations (
    id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE plugin_support_center.tickets (
    id uuid PRIMARY KEY, service_id text NOT NULL REFERENCES public."Service"(id) ON DELETE CASCADE,
    owner_id integer NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    subject varchar(160) NOT NULL, status text NOT NULL DEFAULT 'OPEN'
      CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX support_tickets_owner ON plugin_support_center.tickets(owner_id, updated_at DESC)`,
  `CREATE TABLE plugin_support_center.messages (
    id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES plugin_support_center.tickets(id) ON DELETE CASCADE,
    author_id integer REFERENCES public."User"(id) ON DELETE SET NULL, author_name text NOT NULL,
    body varchar(8000) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX support_messages_ticket ON plugin_support_center.messages(ticket_id, created_at)`,
  `CREATE TABLE plugin_support_center.grants (
    id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES plugin_support_center.tickets(id) ON DELETE CASCADE,
    staff_id integer NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE, staff_name text NOT NULL,
    reason varchar(1000) NOT NULL, scopes text[] NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED','REVOKED')),
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
    expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['status','files:read','files:write','secrets']::text[]),
    CHECK (status <> 'ACTIVE' OR expires_at IS NOT NULL)
  )`,
  `CREATE UNIQUE INDEX support_grant_pending ON plugin_support_center.grants(ticket_id, staff_id) WHERE status = 'PENDING'`,
  `CREATE INDEX support_grants_ticket ON plugin_support_center.grants(ticket_id, created_at DESC)`,
  `CREATE TABLE plugin_support_center.events (
    id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES plugin_support_center.tickets(id) ON DELETE CASCADE,
    actor_id integer REFERENCES public."User"(id) ON DELETE SET NULL, actor_name text NOT NULL,
    action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX support_events_ticket ON plugin_support_center.events(ticket_id, created_at DESC)`,
];

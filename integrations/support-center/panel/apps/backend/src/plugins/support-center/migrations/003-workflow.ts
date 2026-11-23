/** Assignment, per-account read markers, internal notes and operation outcomes. */
export const supportCenterWorkflowMigration = [
  `ALTER TABLE plugin_support_center.tickets ADD COLUMN assigned_staff_id integer REFERENCES public."User"(id) ON DELETE SET NULL`,
  `ALTER TABLE plugin_support_center.messages ADD COLUMN is_internal boolean NOT NULL DEFAULT false`,
  `ALTER TABLE plugin_support_center.messages ADD COLUMN sequence bigint GENERATED ALWAYS AS IDENTITY`,
  `CREATE UNIQUE INDEX support_message_sequence ON plugin_support_center.messages(sequence)`,
  `CREATE TABLE plugin_support_center.reads (
    ticket_id uuid NOT NULL REFERENCES plugin_support_center.tickets(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    last_sequence bigint NOT NULL DEFAULT 0, PRIMARY KEY(ticket_id,user_id)
  )`,
  `ALTER TABLE plugin_support_center.events ADD COLUMN is_internal boolean NOT NULL DEFAULT false,
    ADD COLUMN target_name text, ADD COLUMN request_id uuid, ADD COLUMN operation text,
    ADD COLUMN outcome text CHECK (outcome IN ('PENDING','SUCCEEDED','FAILED','UNKNOWN')),
    ADD COLUMN error_code text, ADD COLUMN finished_at timestamptz`,
  `CREATE UNIQUE INDEX support_event_request ON plugin_support_center.events(request_id) WHERE request_id IS NOT NULL`,
  `CREATE INDEX support_message_ticket_sequence ON plugin_support_center.messages(ticket_id,sequence DESC)`,
  `CREATE INDEX support_event_ticket_cursor ON plugin_support_center.events(ticket_id,created_at DESC,id DESC)`,
  `CREATE INDEX support_ticket_assignee ON plugin_support_center.tickets(assigned_staff_id,updated_at DESC)`,
];

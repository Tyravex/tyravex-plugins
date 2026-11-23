/** Durable mutation receipts, shared rate limits and service-history retention. */
export const supportCenterReliabilityMigration = [
  `ALTER TABLE plugin_support_center.tickets
    ADD COLUMN service_snapshot_id text,
    ADD COLUMN service_name text,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN archived_owner_id integer REFERENCES public."User"(id) ON DELETE SET NULL`,
  `UPDATE plugin_support_center.tickets t SET service_snapshot_id=t.service_id,service_name=s.name FROM public."Service" s WHERE s.id=t.service_id`,
  `ALTER TABLE plugin_support_center.tickets ALTER COLUMN service_snapshot_id SET NOT NULL,ALTER COLUMN service_name SET NOT NULL,
    ALTER COLUMN service_id DROP NOT NULL,DROP CONSTRAINT tickets_service_id_fkey,
    ADD CONSTRAINT tickets_service_id_fkey FOREIGN KEY(service_id) REFERENCES public."Service"(id) ON DELETE SET NULL`,
  `CREATE FUNCTION plugin_support_center.snapshot_service() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.service_id IS NOT NULL THEN
        SELECT id,name INTO NEW.service_snapshot_id,NEW.service_name FROM public."Service" WHERE id=NEW.service_id;
      END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER support_ticket_snapshot BEFORE INSERT OR UPDATE OF service_id ON plugin_support_center.tickets FOR EACH ROW EXECUTE FUNCTION plugin_support_center.snapshot_service()`,
  `CREATE FUNCTION plugin_support_center.archive_service() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE plugin_support_center.tickets SET service_name=OLD.name,archived_at=clock_timestamp(),
        archived_owner_id=(SELECT id FROM public."User" WHERE id=OLD."userId"),status='CLOSED',updated_at=clock_timestamp() WHERE service_id=OLD.id;
      UPDATE plugin_support_center.grants g SET status='REVOKED' FROM plugin_support_center.tickets t
        WHERE g.ticket_id=t.id AND t.service_id=OLD.id AND g.status IN ('PENDING','ACTIVE');
      INSERT INTO plugin_support_center.events(id,ticket_id,actor_name,action)
        SELECT gen_random_uuid(),id,'System','SERVICE_ARCHIVED' FROM plugin_support_center.tickets WHERE service_id=OLD.id;
      RETURN OLD;
    END $$`,
  `CREATE TRIGGER support_archive_service BEFORE DELETE ON public."Service" FOR EACH ROW EXECUTE FUNCTION plugin_support_center.archive_service()`,
  `CREATE INDEX support_ticket_snapshot ON plugin_support_center.tickets(service_snapshot_id,updated_at DESC)`,
  `CREATE TABLE plugin_support_center.mutation_receipts (
    actor_id integer NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    key uuid NOT NULL, fingerprint text NOT NULL, response jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(actor_id,key)
  )`,
  `CREATE TABLE plugin_support_center.rate_limits (
    actor_id integer NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    action text NOT NULL,window_start timestamptz NOT NULL,attempts integer NOT NULL,
    PRIMARY KEY(actor_id,action)
  )`,
  `CREATE INDEX support_receipt_expiry ON plugin_support_center.mutation_receipts(expires_at)`,
];

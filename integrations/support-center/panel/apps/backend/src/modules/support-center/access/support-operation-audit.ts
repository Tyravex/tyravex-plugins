import type { Tx } from '../support-context';

export async function lockSupportAuditPlugin(tx: Tx) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Plugin" WHERE id='tyravex.support-center' AND "storagePath"='native/tyravex.support-center' FOR SHARE`;
  return rows.length > 0;
}
/** Outcome codes only: never persist command payloads, file contents or agent error text. */
export async function finishSupportOperation(
  tx: Tx,
  requestId: string,
  outcome: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
  error?: unknown,
) {
  if (!(await lockSupportAuditPlugin(tx))) return;
  const code =
    typeof error === 'string' && /^[A-Z_]{1,64}$/.test(error) ? error : null;
  await tx.$executeRaw`UPDATE plugin_support_center.events SET outcome=${outcome},error_code=${code},finished_at=now() WHERE request_id=${requestId}::uuid AND outcome IN ('PENDING','UNKNOWN')`;
}

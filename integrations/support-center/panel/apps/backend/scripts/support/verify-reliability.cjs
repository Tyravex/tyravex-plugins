const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Called only by the disposable PostgreSQL harness; never reads panel configuration.
module.exports = async function verifySupportReliability({
  database,
  support,
  workflow,
  consent,
  staffA,
  staffB,
  category,
  delivered,
}) {
  const user = await database.user.create({
    data: {
      username: 'reliability_client',
      email: 'reliability@example.invalid',
      password: 'test-only',
    },
  });
  const client = { id: user.id, username: user.username, permissions: [] };
  const service = await database.service.create({
    data: { name: 'Retained bot', userId: user.id, categoryId: category.id },
  });
  const other = await database.service.create({
    data: { name: 'Other bot', userId: user.id, categoryId: category.id },
  });
  const resetLimits = () =>
    database.$executeRaw`DELETE FROM plugin_support_center.rate_limits WHERE actor_id=${client.id}`;
  try {
    const body = {
      serviceId: service.id,
      subject: 'Duplicate test',
      body: 'A private body that must not enter notifications',
    };
    const key = randomUUID();
    const beforeDelivery = delivered.length;
    const [one, two] = await Promise.all([
      support.create(client, body, key),
      support.create(client, body, key),
    ]);
    assert.equal(one.id, two.id);
    assert.equal((await support.list(client, false)).total, 1);
    const count = delivered.length;
    assert.ok(count > beforeDelivery);
    await support.create(client, body, key);
    assert.equal(
      delivered.length,
      count,
      'A receipt replay must not emit duplicates',
    );
    await assert.rejects(
      support.create(client, { ...body, subject: 'Different request' }, key),
      /SUPPORT_IDEMPOTENCY_CONFLICT/,
    );
    const receipts =
      await database.$queryRaw`SELECT response FROM plugin_support_center.mutation_receipts WHERE actor_id=${client.id}`;
    assert.ok(!JSON.stringify(receipts).includes(body.body));
    assert.ok(!delivered.some((n) => n.content.includes(body.body)));
    console.log(
      'PASS: Concurrent idempotency, mismatched reuse and delivery strictly after commit',
    );

    const id = one.id;
    await workflow.assign(id, staffA, staffB.id, true);
    let since = delivered.length;
    await support.message(
      id,
      client,
      'A question for the assigned worker',
      randomUUID(),
    );
    assert.deepEqual(
      delivered.slice(since).map((n) => n.userId),
      [staffB.id],
    );
    assert.ok(delivered.at(-1).content.includes('"event":"MESSAGE_ADDED"'));
    await database.user.update({
      where: { id: staffB.id },
      data: { isActive: false },
    });
    since = delivered.length;
    await support.message(id, client, 'The assigned worker is unavailable');
    assert.ok(delivered.slice(since).some((n) => n.userId === staffA.id));
    assert.ok(!delivered.slice(since).some((n) => n.userId === staffB.id));
    await database.user.update({
      where: { id: staffB.id },
      data: { isActive: true },
    });
    console.log(
      'PASS: Typed notifications target the assignee and fall back to eligible active staff',
    );

    await resetLimits();
    for (let i = 0; i < 20; i++)
      await support.message(id, client, `Limited reply ${i}`);
    const messagesBefore = (await support.detail(id, client)).messages.length;
    let rejected;
    try {
      await support.message(id, client, 'Must not be inserted');
    } catch (error) {
      rejected = error;
    }
    assert.equal(rejected?.getStatus(), 429);
    assert.ok(rejected.getResponse().retryAfter > 0);
    assert.equal(
      (await support.detail(id, client)).messages.length,
      messagesBefore,
    );
    const counter =
      await database.$queryRaw`SELECT attempts FROM plugin_support_center.rate_limits WHERE actor_id=${client.id} AND action='message'`;
    assert.equal(counter[0].attempts, 21, 'Rejected attempts remain counted');
    await resetLimits();
    console.log(
      'PASS: Shared rate limit persists rejected attempts without inserting a message',
    );

    for (let i = 0; i < 18; i++)
      await database.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject) VALUES (${randomUUID()}::uuid,${service.id},${client.id},'Capacity fixture')`;
    const races = await Promise.allSettled([
      support.create(client, { ...body, subject: 'Race A' }),
      support.create(client, {
        ...body,
        serviceId: other.id,
        subject: 'Race B',
      }),
    ]);
    assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await support.list(client, false)).counts.OPEN +
        (await support.list(client, false)).counts.IN_PROGRESS,
      20,
    );
    const closed = randomUUID();
    await database.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject,status) VALUES (${closed}::uuid,${other.id},${client.id},'Reopen fixture','CLOSED')`;
    await assert.rejects(
      support.changeStatus(closed, staffA, 'OPEN'),
      /SUPPORT_TICKET_LIMIT/,
    );
    await assert.rejects(
      support.changeStatus(closed, staffA, 'IN_PROGRESS'),
      /SUPPORT_STATUS_INVALID/,
    );
    const eventCount =
      await database.$queryRaw`SELECT count(*)::int AS count FROM plugin_support_center.events WHERE ticket_id=${id}::uuid`;
    await support.changeStatus(id, staffA, 'IN_PROGRESS');
    const afterNoop =
      await database.$queryRaw`SELECT count(*)::int AS count FROM plugin_support_center.events WHERE ticket_id=${id}::uuid`;
    assert.deepEqual(afterNoop, eventCount);
    console.log(
      'PASS: Capacity across services, reopening limit, status transitions and no-op audit isolation',
    );

    await consent.grantToAssignee(id, client, {
      staffId: staffB.id,
      reason: 'Inspect the service files',
      scopes: ['files:read'],
      durationMinutes: 15,
    });
    await support.changeStatus(id, staffA, 'CLOSED');
    since = delivered.length;
    await support.changeStatus(id, client, 'OPEN');
    assert.deepEqual(
      delivered.slice(since).map((n) => n.userId),
      [staffB.id],
    );
    assert.ok(delivered.at(-1).content.includes('"event":"STATUS_OPEN"'));
    assert.ok(
      (await support.detail(id, client)).grants.every(
        (g) => g.status === 'REVOKED',
      ),
    );
    await consent.grantToAssignee(id, client, {
      staffId: staffB.id,
      reason: 'Inspect before archival',
      scopes: ['files:read'],
      durationMinutes: 15,
    });
    await workflow.note(id, staffA, 'PRIVATE_ARCHIVED_NOTE');
    await database.service.update({
      where: { id: service.id },
      data: { name: 'Renamed retained bot' },
    });
    await database.service.delete({ where: { id: service.id } });
    const archived = await support.detail(id, client);
    assert.ok(archived.archivedAt);
    assert.equal(archived.status, 'CLOSED');
    assert.equal(archived.serviceId, service.id);
    assert.equal(archived.serviceName, 'Renamed retained bot');
    assert.ok(!JSON.stringify(archived).includes('PRIVATE_ARCHIVED_NOTE'));
    assert.ok(archived.grants.every((g) => g.status === 'REVOKED'));
    assert.ok(archived.events.some((e) => e.action === 'SERVICE_ARCHIVED'));
    assert.ok(
      (await support.list(client, false, { serviceId: service.id })).total > 0,
    );
    await assert.rejects(
      support.changeStatus(id, client, 'OPEN'),
      /SUPPORT_TICKET_ARCHIVED/,
    );
    await assert.rejects(
      support.message(id, client, 'Cannot mutate archive'),
      /SUPPORT_TICKET_ARCHIVED/,
    );
    await assert.rejects(
      workflow.assign(id, staffA, staffA.id),
      /SUPPORT_TICKET_ARCHIVED/,
    );
    await workflow.markRead(id, client, archived.messages.at(-1).id);
    assert.ok(
      (await support.detail(id, staffA, { staff: 'true' })).messages.some(
        (m) => m.body === 'PRIVATE_ARCHIVED_NOTE',
      ),
    );
    const transferred = randomUUID();
    await database.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject) VALUES (${transferred}::uuid,${other.id},${client.id},'Transferred service')`;
    await database.service.update({
      where: { id: other.id },
      data: { userId: staffA.id },
    });
    await database.service.delete({ where: { id: other.id } });
    await assert.rejects(
      support.detail(transferred, client),
      /SUPPORT_NOT_FOUND/,
    );
    assert.ok(
      !(await support.list(client, false)).items.some(
        (t) => t.id === transferred,
      ),
    );
    console.log(
      'PASS: Archival retains conversation and service identity, revokes grants and preserves owner/internal-note isolation',
    );
    await require('./verify-http-workflow.cjs')({
      database,
      support,
      workflow,
      consent,
      client,
      staffA,
      category,
    });
  } finally {
    await database.user.update({
      where: { id: staffB.id },
      data: { isActive: true },
    });
    await database.notification.deleteMany({ where: { userId: user.id } });
    await database.user.delete({ where: { id: user.id } });
  }
};

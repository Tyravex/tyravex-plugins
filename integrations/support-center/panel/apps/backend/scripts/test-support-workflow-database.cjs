// Dedicated, disposable database only. Never read the application .env or reuse its connection.
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { resolve, dirname, join } = require('node:path');
const assert = require('node:assert/strict');
const backend = resolve(__dirname, '..');
const runId = randomUUID();
const container = `tyravex-support-workflow-${runId}`;
let database;
let created = false;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', shell: false });
  if (result.status !== 0)
    throw new Error(`Docker command failed: ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}
function cleanup() {
  if (!created) return;
  const inspected = JSON.parse(docker(['inspect', container]))[0];
  if (
    inspected.Name !== `/${container}` ||
    inspected.Config.Labels['tyravex.support-test'] !== runId
  )
    throw new Error('Refusing cleanup of an unowned container');
  docker(['rm', '--force', '--volumes', container]);
  created = false;
  console.log(
    'PASS: Removed only the owned test container and its temporary data',
  );
}
async function main() {
  docker([
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    `tyravex.support-test=${runId}`,
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--env',
    'POSTGRES_USER=support_test',
    '--env',
    `POSTGRES_PASSWORD=${randomUUID()}`,
    '--env',
    'POSTGRES_DB=tyravex_support_workflow',
    'postgres:15',
  ]);
  created = true;
  const info = JSON.parse(docker(['inspect', container]))[0];
  const port = info.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const password = info.Config.Env.find((value) =>
    value.startsWith('POSTGRES_PASSWORD='),
  ).split('=')[1];
  const url = `postgresql://support_test:${password}@127.0.0.1:${port}/tyravex_support_workflow?schema=public`;
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.pathname, '/tyravex_support_workflow');
  assert.equal(parsed.username, 'support_test');
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const probe = spawnSync(
      'docker',
      [
        'exec',
        container,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'support_test',
        '-d',
        'tyravex_support_workflow',
      ],
      { encoding: 'utf8', shell: false },
    );
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(ready, 'Temporary PostgreSQL must become ready');
  const env = { ...process.env, DATABASE_URL: url };
  const prismaCli = join(
    dirname(require.resolve('prisma/package.json')),
    'build',
    'index.js',
  );
  const pushed = spawnSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--schema', 'prisma'],
    { cwd: backend, env, encoding: 'utf8', shell: false },
  );
  if (pushed.status !== 0)
    throw new Error(`Test schema preparation failed: ${pushed.stderr}`);
  console.log('PASS: Core schema prepared only in the disposable database');
  process.env.DATABASE_URL = url;
  require('ts-node').register({
    transpileOnly: true,
    project: join(backend, 'tsconfig.json'),
  });
  require('tsconfig-paths').register({
    baseUrl: backend,
    paths: { '@/*': ['./src/*'] },
  });
  const { PrismaService } = require('../src/prisma/prisma.service');
  const {
    FunctionalPluginInstallerService,
  } = require('../src/modules/plugins/functional/functional-plugin-installer.service');
  const {
    PluginLifecycleService,
  } = require('../src/modules/plugins/lifecycle/plugin-lifecycle.service');
  const {
    PluginRoleManagementService,
  } = require('../src/rbac/plugin-roles/plugin-role-management.service');
  const {
    SupportCenterService,
  } = require('../src/modules/support-center/support-center.service');
  const {
    SupportWorkflowService,
  } = require('../src/modules/support-center/workflow/support-workflow.service');
  const {
    supportCenterInitialMigration,
  } = require('../src/plugins/support-center/migrations/001-initial');
  const {
    authorizeSupportWorkspace,
  } = require('../src/modules/support-center/access/support-access.policy');
  const {
    finishSupportOperation,
  } = require('../src/modules/support-center/access/support-operation-audit');
  database = new PrismaService();
  await database.$connect();
  const permissions = ['support:read', 'support:manage', 'support:access'];
  await database.permission.create({ data: { name: 'user:read' } });
  for (const name of permissions)
    await database.permission.create({ data: { name } });
  const users = [];
  for (const username of ['client', 'staff_a', 'staff_b', 'outsider'])
    users.push(
      await database.user.create({
        data: {
          username,
          email: `${username}@example.invalid`,
          password: 'test-only',
        },
      }),
    );
  await database.role.create({
    data: {
      name: 'Owner',
      permissions: { connect: permissions.map((name) => ({ name })) },
    },
  });
  const supportRole = await database.role.create({
    data: {
      name: 'Support',
      permissions: {
        connect: [{ name: 'user:read' }],
      },
    },
  });
  const workerRole = await database.role.create({
    data: {
      name: 'Test operators',
      permissions: { connect: permissions.map((name) => ({ name })) },
      users: { create: [{ userId: users[1].id }, { userId: users[2].id }] },
    },
  });
  const category = await database.serviceCategory.create({
    data: { key: 'test', name: 'Test service' },
  });
  const service = await database.service.create({
    data: {
      name: 'Workflow bot',
      userId: users[0].id,
      categoryId: category.id,
    },
  });
  // Simulate a real older local installation without the new metadata/workflow tables.
  for (const sql of supportCenterInitialMigration)
    await database.$executeRawUnsafe(sql);
  await database.$executeRaw`INSERT INTO plugin_support_center.migrations(id,checksum) VALUES ('001_initial',${createHash('sha256').update(supportCenterInitialMigration.join('\n')).digest('hex')})`;
  await database.plugin.create({
    data: {
      id: 'tyravex.support-center',
      type: 'INTEGRATION',
      version: '0.1.0',
      status: 'INSTALLED',
      storagePath: 'native/tyravex.support-center',
    },
  });
  const installer = new FunctionalPluginInstallerService(database);
  const {
    SupportMutationService,
  } = require('../src/modules/support-center/mutations/support-mutation.service');
  const delivered = [];
  const mutations = new SupportMutationService(database, {
    sendToUser: async (userId, notification) => {
      assert.ok(
        await database.notification.findUnique({
          where: { id: notification.id },
        }),
        'Socket delivery must follow commit',
      );
      delivered.push(notification);
    },
  });
  const support = new SupportCenterService(
    database,
    {
      execute: async () => ({ running: true, logs: 'must not leak' }),
    },
    mutations,
  );
  const workflow = new SupportWorkflowService(database, mutations);
  const {
    SupportConsentService,
  } = require('../src/modules/support-center/access/support-consent.service');
  const consent = new SupportConsentService(mutations);
  const roles = new PluginRoleManagementService(database);
  const actor = (user) => ({
    id: user.id,
    username: user.username,
    permissions:
      user.id === users[1].id || user.id === users[2].id ? permissions : [],
  });
  const client = actor(users[0]);
  const staffA = actor(users[1]);
  const staffB = actor(users[2]);
  assert.equal((await support.availability()).ready, false);
  const legacyTicket = randomUUID();
  await database.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject,status) VALUES (${legacyTicket}::uuid,${service.id},${client.id},'Existing conversation','RESOLVED')`;
  await database.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body) VALUES (${randomUUID()}::uuid,${legacyTicket}::uuid,${client.id},${client.username},'Message created before upgrade')`;
  await installer.upgrade(
    'tyravex.support-center',
    staffA.id,
    'tyravex.support-center',
  );
  assert.equal((await support.availability()).ready, true);
  const retained = await support.detail(legacyTicket, client);
  assert.equal(retained.serviceId, service.id);
  assert.equal(retained.serviceName, service.name);
  assert.equal(retained.status, 'RESOLVED');
  assert.equal(retained.messages[0].body, 'Message created before upgrade');
  const snapshot =
    await database.$queryRaw`SELECT service_snapshot_id,service_name FROM plugin_support_center.tickets WHERE id=${legacyTicket}::uuid`;
  assert.deepEqual(snapshot[0], {
    service_snapshot_id: service.id,
    service_name: service.name,
  });
  await database.$executeRaw`DELETE FROM plugin_support_center.tickets WHERE id=${legacyTicket}::uuid`;
  await installer.upgrade(
    'tyravex.support-center',
    staffA.id,
    'tyravex.support-center',
  );
  console.log(
    'PASS: Upgrade 0.1 to 0.3 preserves existing messages/service snapshots and verifies migration checksums',
  );
  await roles.bind(supportRole.id, staffA.id, supportRole.id);
  assert.equal(
    (await roles.decorate([supportRole]))[0].management.protected,
    true,
  );
  const { id } = await support.create(client, {
    serviceId: service.id,
    subject: 'Startup issue',
    body: 'Please inspect startup',
  });
  await support.message(id, staffA, 'Public response');
  await workflow.note(id, staffA, 'INTERNAL-ONLY-CONTENT');
  const customerView = await support.detail(id, client);
  assert.ok(!JSON.stringify(customerView).includes('INTERNAL-ONLY-CONTENT'));
  assert.ok(
    !customerView.events.some((event) => event.action === 'NOTE_ADDED'),
  );
  const privilegedOwner = await support.detail(
    id,
    { ...client, permissions },
    { staff: 'true' },
  );
  assert.ok(!JSON.stringify(privilegedOwner).includes('INTERNAL-ONLY-CONTENT'));
  const staffView = await support.detail(id, staffA, { staff: 'true' });
  assert.ok(
    staffView.messages.some(
      (message) => message.internal && message.body === 'INTERNAL-ONLY-CONTENT',
    ),
  );
  await assert.rejects(
    workflow.note(
      id,
      { ...client, permissions },
      'Cannot add own internal note',
    ),
    /SUPPORT_INTERNAL_DENIED/,
  );
  await assert.rejects(
    support.detail(id, actor(users[3])),
    /SUPPORT_NOT_FOUND/,
  );
  console.log(
    'PASS: Internal notes/events are isolated from clients, privileged owners and foreign accounts',
  );
  assert.deepEqual(await workflow.unread(client, false), {
    tickets: 1,
    messages: 1,
  });
  const reply = customerView.messages.find(
    (message) => message.body === 'Public response',
  );
  await workflow.markRead(id, client, reply.id);
  assert.deepEqual(await workflow.unread(client, false), {
    tickets: 0,
    messages: 0,
  });
  assert.equal((await workflow.unread(staffB, true)).tickets, 1);
  const note = staffView.messages.find((message) => message.internal);
  await assert.rejects(
    workflow.markRead(id, client, note.id),
    /SUPPORT_INVALID_INPUT/,
  );
  console.log(
    'PASS: Per-account read markers count public replies only and cannot skip through internal notes',
  );
  const claims = await Promise.allSettled([
    workflow.assign(id, staffA, staffA.id, true),
    workflow.assign(id, staffB, staffB.id, true),
  ]);
  assert.equal(
    claims.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    claims.filter((result) => result.status === 'rejected').length,
    1,
  );
  await workflow.assign(id, staffA, staffB.id);
  assert.equal((await support.detail(id, client)).assignedStaffId, staffB.id);
  console.log(
    'PASS: Concurrent claims serialize; explicit staff transfer works',
  );
  for (let i = 0; i < 11; i++) {
    const ticketId = randomUUID();
    await database.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject) VALUES (${ticketId}::uuid,${service.id},${client.id},${'Paged ticket ' + i})`;
    await database.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body) VALUES (${randomUUID()}::uuid,${ticketId}::uuid,${client.id},${client.username},'Sample public body')`;
  }
  const pages = [];
  for (let page = 1; page <= 3; page++)
    pages.push(await support.list(client, false, { page, limit: 5 }));
  assert.equal(
    new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size,
    12,
  );
  assert.equal(pages[0].total, 12);
  assert.equal(
    (await support.list(client, false, { q: "%' OR 1=1 --" })).total,
    0,
  );
  assert.equal(
    (await support.list(staffA, true, { assignee: String(staffB.id) })).total,
    1,
  );
  // Reproduce an older core Support role that has no plugin ticket capabilities.
  const { RbacService } = require('../src/rbac/rbac.service');
  const rbac = new RbacService(database, roles);
  await roles.enableTicketManagement(supportRole.id, staffA.id, supportRole.id);
  await rbac.assignRole(client.id, supportRole.id, staffA.id);
  const grantedUser = await database.user.findUnique({
    where: { id: client.id },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  const grantedActor = {
    ...client,
    permissions: [
      ...new Set(
        grantedUser.roles.flatMap((m) => m.role.permissions.map((p) => p.name)),
      ),
    ],
  };
  assert.ok(grantedActor.permissions.includes('support:manage'));
  assert.ok(grantedActor.permissions.includes('user:read'));
  assert.ok(!grantedActor.permissions.includes('support:access'));
  await workflow.assign(id, staffA, null);
  await support.changeStatus(id, client, 'OPEN');
  await workflow.assign(id, grantedActor, grantedActor.id, true);
  const ownClaim = await support.detail(id, grantedActor, { staff: 'true' });
  assert.equal(ownClaim.assignedStaffId, client.id);
  assert.equal(ownClaim.status, 'IN_PROGRESS');
  await support.changeStatus(id, grantedActor, 'RESOLVED');
  await support.changeStatus(id, client, 'OPEN');
  await workflow.assign(id, staffA, staffB.id);
  await assert.rejects(
    workflow.assign(id, client, client.id, true),
    /SUPPORT_SCOPE_DENIED/,
  );
  console.log(
    'PASS: Legacy Support role repair, RBAC membership and author/staff ticket acceptance preserve separate service access',
  );
  await database.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body) SELECT gen_random_uuid(),${id}::uuid,${client.id},'client','Older page '||n FROM generate_series(1,60) n`;
  const latest = await support.detail(id, client);
  assert.equal(latest.messages.length, 50);
  assert.ok(latest.messagesNextCursor);
  const older = await workflow.page(
    id,
    client,
    { before: latest.messagesNextCursor },
    'messages',
  );
  assert.ok(older.items.length > 0);
  assert.ok(
    !older.items.some((message) =>
      latest.messages.some((current) => current.id === message.id),
    ),
  );
  console.log(
    'PASS: Ticket pagination, assignee/search filters and stable message cursors',
  );
  await support.requestAccess(id, staffA, {
    reason: 'Inspect runtime safely',
    scopes: ['status'],
    durationMinutes: 15,
  });
  const pending = (
    await support.detail(id, staffA, { staff: 'true' })
  ).grants.find((grant) => grant.status === 'PENDING');
  await support.decide(id, pending.id, client, 'APPROVE');
  assert.equal((await workflow.activeAccess(service.id, client)).length, 1);
  const requestId = randomUUID();
  await database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${service.id} FOR UPDATE`;
    await authorizeSupportWorkspace(
      tx,
      staffA.id,
      service.id,
      'runtime.status',
      {},
      { ticketId: id, grantId: pending.id },
      true,
      requestId,
    );
  });
  await database.$transaction((tx) =>
    finishSupportOperation(tx, requestId, 'FAILED', 'TOKEN=do-not-log'),
  );
  const audit = (await support.detail(id, client)).events.find(
    (event) => event.requestId === requestId,
  );
  assert.equal(audit.outcome, 'FAILED');
  assert.equal(audit.errorCode, null);
  assert.ok(audit.finishedAt);
  await support.decide(id, pending.id, client, 'REVOKE');
  assert.equal((await workflow.activeAccess(service.id, client)).length, 0);
  console.log(
    'PASS: Owner access banner data, revocation and sanitized agent-operation outcomes',
  );
  assert.equal((await support.detail(id, client)).assignedStaffCanAccess, true);
  const direct = {
    staffId: staffB.id,
    reason: 'Owner authorizes diagnosis',
    scopes: ['files:read'],
    durationMinutes: 15,
  };
  await consent.grantToAssignee(id, client, direct);
  const directGrant = (await support.detail(id, client)).grants.find(
    (g) => g.staffId === staffB.id && g.status === 'ACTIVE',
  );
  assert.ok(directGrant);
  assert.deepEqual(directGrant.scopes, ['files:read']);
  assert.ok(
    new Date(directGrant.expiresAt).getTime() > Date.now() + 14 * 60000,
  );
  await assert.rejects(
    consent.grantToAssignee(id, client, direct),
    /SUPPORT_ACCESS_EXISTS/,
  );
  const authorizeDirect = (operation, path) =>
    database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${service.id} FOR UPDATE`;
      return authorizeSupportWorkspace(
        tx,
        staffB.id,
        service.id,
        operation,
        { path },
        { ticketId: id, grantId: directGrant.id },
        false,
      );
    });
  await authorizeDirect('files.read', '/bot.js');
  await assert.rejects(
    authorizeDirect('files.write', '/bot.js'),
    /SUPPORT_SCOPE_DENIED/,
  );
  await assert.rejects(
    authorizeDirect('files.read', '/.env'),
    /SUPPORT_SECRETS_DENIED/,
  );
  await support.decide(id, directGrant.id, client, 'REVOKE');
  await assert.rejects(
    authorizeDirect('files.read', '/bot.js'),
    /SUPPORT_ACCESS_INACTIVE/,
  );
  console.log(
    'PASS: Owner-initiated assignee consent, scope isolation, expiration and revocation use the existing broker policy',
  );
  await require('./support/verify-reliability.cjs')({
    database,
    support,
    workflow,
    consent,
    staffA,
    staffB,
    category,
    delivered,
  });
  const lifecycle = new PluginLifecycleService(database);
  await lifecycle.disable('tyravex.support-center', staffA.id);
  await assert.rejects(support.list(client, false), /SUPPORT_DISABLED/);
  await installer.uninstall(
    'tyravex.support-center',
    staffA.id,
    'tyravex.support-center',
    false,
  );
  await installer.install(
    'tyravex.support-center',
    staffA.id,
    'tyravex.support-center',
  );
  assert.equal((await support.list(client, false)).total, 12);
  assert.equal(
    (
      await database.role.findUnique({
        where: { id: workerRole.id },
        include: { users: true },
      })
    ).users.length,
    2,
  );
  await lifecycle.disable('tyravex.support-center', staffA.id);
  await installer.uninstall(
    'tyravex.support-center',
    staffA.id,
    'tyravex.support-center',
    true,
  );
  assert.equal(
    (
      await database.$queryRaw`SELECT to_regnamespace('plugin_support_center')::text AS name`
    )[0].name,
    null,
  );
  assert.equal(await database.user.count(), 4);
  assert.equal(await database.service.count(), 1);
  console.log(
    'PASS: Retained-data reinstall and explicit plugin-only data removal preserve core data',
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (database) await database.$disconnect();
    try {
      cleanup();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { PassportModule } = require('@nestjs/passport');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { PrismaService } = require('../../src/prisma/prisma.service');
const {
  JwtStrategy,
} = require('../../src/modules/auth/strategies/jwt.strategy');
const {
  JwtAuthGuard,
} = require('../../src/modules/auth/guards/jwt-auth.guard');
const {
  SupportCenterController,
} = require('../../src/modules/support-center/support-center.controller');
const {
  SupportCenterService,
} = require('../../src/modules/support-center/support-center.service');
const {
  SupportWorkflowController,
} = require('../../src/modules/support-center/workflow/support-workflow.controller');
const {
  SupportWorkflowService,
} = require('../../src/modules/support-center/workflow/support-workflow.service');
const {
  SupportConsentController,
} = require('../../src/modules/support-center/access/support-consent.controller');
const {
  SupportConsentService,
} = require('../../src/modules/support-center/access/support-consent.service');

// Only called with the disposable database. No mocked auth guard or forged req.user.
module.exports = async function verifyHttpWorkflow({
  database,
  support,
  workflow,
  consent,
  client,
  staffA,
  category,
}) {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  let app;
  const service = await database.service.create({
    data: {
      name: 'HTTP support test',
      userId: client.id,
      categoryId: category.id,
    },
  });
  const sessions = [];
  const token = async (actor) => {
    const session = await database.session.create({
      data: { userId: actor.id, expiresAt: new Date(Date.now() + 600000) },
    });
    sessions.push(session.id);
    return jwt.sign(
      { sub: actor.id, sid: session.id, tokenType: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    );
  };
  try {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [
        SupportCenterController,
        SupportWorkflowController,
        SupportConsentController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: PrismaService,
          useValue: { user: database.user, session: database.session },
        },
        { provide: SupportCenterService, useValue: support },
        { provide: SupportWorkflowService, useValue: workflow },
        { provide: SupportConsentService, useValue: consent },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const owner = await token(client),
      worker = await token(staffA);
    const send = (method, path, auth, body, key) => {
      let call = request(app.getHttpServer())[method](path);
      if (auth) call = call.auth(auth, { type: 'bearer' });
      if (key) call = call.set('Idempotency-Key', key);
      return body ? call.send(body) : call;
    };
    await send('get', '/support/tickets', null).expect(401);
    const payload = {
      serviceId: service.id,
      subject: 'HTTP workflow',
      body: 'Owner requests help',
    };
    const key = randomUUID();
    const [first, duplicate] = await Promise.all([
      send('post', '/support/tickets', owner, payload, key).expect(201),
      send('post', '/support/tickets', owner, payload, key).expect(201),
    ]);
    assert.equal(first.body.id, duplicate.body.id);
    const base = `/support/tickets/${first.body.id}`;
    await send('post', `${base}/claim`, owner).expect(403);
    await send('post', `${base}/claim`, worker).expect(201);
    await send(
      'post',
      `${base}/messages`,
      worker,
      { body: 'Worker reply' },
      randomUUID(),
    ).expect(201);
    const scopes = {
      staffId: staffA.id,
      reason: 'Read-only diagnostic access',
      scopes: ['status'],
      durationMinutes: 15,
    };
    await send('post', `${base}/owner-access`, worker, scopes).expect(403);
    await send(
      'post',
      `${base}/owner-access`,
      owner,
      scopes,
      randomUUID(),
    ).expect(201);
    const detail = (await send('get', base, owner).expect(200)).body;
    const grant = detail.grants.find((g) => g.status === 'ACTIVE');
    assert.ok(grant);
    const status = await send('post', `${base}/workspace`, worker, {
      grantId: grant.id,
      operation: 'runtime.status',
      args: {},
    }).expect(201);
    assert.deepEqual(status.body, { running: true });
    await send('post', `${base}/access/${grant.id}`, owner, {
      decision: 'REVOKE',
    }).expect(201);
    await send('post', `${base}/workspace`, worker, {
      grantId: grant.id,
      operation: 'runtime.status',
      args: {},
    }).expect(403);
    await database.user.update({
      where: { id: staffA.id },
      data: { isActive: false },
    });
    await send('get', '/support/tickets?staff=true', worker).expect(401);
    await database.user.update({
      where: { id: staffA.id },
      data: { isActive: true },
    });
    await database.session.update({
      where: { id: sessions[0] },
      data: { revokedAt: new Date() },
    });
    await send('get', base, owner).expect(401);
    console.log(
      'PASS: Real JWT/session HTTP workflow for owner and staff, idempotency, scope revocation and disabled accounts',
    );
  } finally {
    if (app) await app.close();
    await database.user.update({
      where: { id: staffA.id },
      data: { isActive: true },
    });
    await database.session.deleteMany({ where: { id: { in: sessions } } });
    await database.service.delete({ where: { id: service.id } });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
};

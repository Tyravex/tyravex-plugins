import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { SupportCenterController } from '../support-center.controller';
import { SupportCenterService } from '../support-center.service';
import { SupportConsentController } from '../access/support-consent.controller';
import { SupportConsentService } from '../access/support-consent.service';
import { SupportRateLimitException } from '../mutations/support-rate-limit.exception';

describe('support ticket HTTP input boundaries', () => {
  let app: INestApplication;
  let authenticated = true;
  const id = '11111111-1111-4111-8111-111111111111';
  const service = {
    create: jest.fn(),
    requestAccess: jest.fn(),
    decide: jest.fn(),
    execute: jest.fn(),
    list: jest.fn(),
    grantToAssignee: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SupportCenterController, SupportConsentController],
      providers: [
        { provide: SupportCenterService, useValue: service },
        { provide: SupportConsentService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          if (!authenticated) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = {
            id: 7,
            username: 'client',
            permissions: [],
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    authenticated = true;
    service.create.mockResolvedValue({ id });
  });
  afterAll(() => app.close());
  it('validates owner consent and never accepts a forged owner, recipient type or unrestricted scope', async () => {
    const path = `/support/tickets/${id}/owner-access`;
    const body = {
      staffId: 4,
      reason: 'Inspect my service',
      scopes: ['status'],
      durationMinutes: 30,
    };
    for (const extra of [
      { ownerId: 99 },
      { staffId: '4' },
      { scopes: ['admin'] },
      { durationMinutes: 999 },
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .send({ ...body, ...extra })
        .expect(400);
    }
    expect(service.grantToAssignee).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(path).send(body).expect(201);
    expect(service.grantToAssignee).toHaveBeenCalledWith(
      id,
      { id: 7, username: 'client', permissions: [] },
      expect.objectContaining(body),
      undefined,
    );
  });
  it('requires authentication', async () => {
    authenticated = false;
    await request(app.getHttpServer()).get('/support/tickets').expect(401);
  });
  it('takes the owner identity from authentication only', async () => {
    const body = {
      serviceId: 'service',
      subject: 'Test issue',
      body: 'Please help',
    };
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...body, ownerId: 99 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send(body)
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      { id: 7, username: 'client', permissions: [] },
      expect.objectContaining(body),
      undefined,
    );
  });
  it('forwards the receipt key and exposes a bounded retry hint on throttling', async () => {
    service.create.mockRejectedValueOnce(new SupportRateLimitException(45));
    const response = await request(app.getHttpServer())
      .post('/support/tickets')
      .set('Idempotency-Key', id)
      .send({
        serviceId: 'service',
        subject: 'Startup issue',
        body: 'Please help',
      })
      .expect(429);
    expect(response.headers['retry-after']).toBe('45');
    expect(response.body).toEqual({
      message: 'SUPPORT_RATE_LIMITED',
      retryAfter: 45,
    });
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      expect.anything(),
      id,
    );
  });
  it('rejects invalid consent scopes, unbounded duration and unknown actions', async () => {
    await request(app.getHttpServer())
      .post(`/support/tickets/${id}/access`)
      .send({
        reason: 'Inspect the service',
        scopes: ['admin'],
        durationMinutes: 60,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/support/tickets/${id}/access`)
      .send({
        reason: 'Inspect the service',
        scopes: ['status'],
        durationMinutes: 999999,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/support/tickets/${id}/access/${id}`)
      .send({ decision: 'ADMIN_OVERRIDE' })
      .expect(400);
    expect(service.requestAccess).not.toHaveBeenCalled();
    expect(service.decide).not.toHaveBeenCalled();
  });
  it('restricts support workspace operations instead of forwarding arbitrary commands', async () => {
    await request(app.getHttpServer())
      .post(`/support/tickets/${id}/workspace`)
      .send({ grantId: id, operation: 'backup.restore', args: {} })
      .expect(400);
    await request(app.getHttpServer())
      .post('/support/tickets/not-a-uuid/workspace')
      .send({ grantId: id, operation: 'runtime.status', args: {} })
      .expect(400);
    expect(service.execute).not.toHaveBeenCalled();
  });
});

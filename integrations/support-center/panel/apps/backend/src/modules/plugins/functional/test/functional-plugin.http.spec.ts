import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { FunctionalPluginController } from '../functional-plugin.controller';
import { FunctionalPluginInstallerService } from '../functional-plugin-installer.service';
import { PluginRoleManagementService } from '@/rbac/plugin-roles/plugin-role-management.service';

describe('local plugin installation HTTP permissions', () => {
  let app: INestApplication;
  let permissions: string[] | null;
  const service = {
    localCatalog: jest.fn(),
    install: jest.fn(),
    uninstall: jest.fn(),
  };
  const roles = {
    candidates: jest.fn(),
    bind: jest.fn(),
    enableTicketManagement: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FunctionalPluginController],
      providers: [
        { provide: FunctionalPluginInstallerService, useValue: service },
        { provide: PluginRoleManagementService, useValue: roles },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          if (!permissions) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = { id: 7, permissions };
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
    permissions = ['plugin:read', 'plugin:manage', 'plugin:delete'];
    service.localCatalog.mockResolvedValue([]);
    service.install.mockResolvedValue({ id: 'tyravex.support-center' });
  });
  afterAll(() => app.close());
  it('requires explicit role management to enable ticket permissions, using the authenticated actor', async () => {
    const path = '/admin/local-plugins/tyravex.support-center/ticket-role';
    const body = { roleId: 'support-role', confirmation: 'support-role' };
    await request(app.getHttpServer()).post(path).send(body).expect(403);
    expect(roles.enableTicketManagement).not.toHaveBeenCalled();
    permissions = ['plugin:read', 'plugin:manage', 'role:read', 'role:manage'];
    await request(app.getHttpServer())
      .post(path)
      .send({ ...body, actorId: 99 })
      .expect(400);
    await request(app.getHttpServer()).post(path).send(body).expect(201);
    expect(roles.enableTicketManagement).toHaveBeenCalledWith(
      'support-role',
      7,
      'support-role',
    );
  });
  it('requires role management as well as plugin management to bind an existing role', async () => {
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/managed-role')
      .send({ roleId: 'support-id', confirmation: 'support-id' })
      .expect(403);
    expect(roles.bind).not.toHaveBeenCalled();
    permissions = ['plugin:read', 'plugin:manage', 'role:read', 'role:manage'];
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/managed-role')
      .send({ roleId: 'support-id', confirmation: 'support-id', actorId: 99 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/managed-role')
      .send({ roleId: 'support-id', confirmation: 'support-id' })
      .expect(201);
    expect(roles.bind).toHaveBeenCalledWith('support-id', 7, 'support-id');
  });
  it('requires authentication and separates read access from installation', async () => {
    permissions = null;
    await request(app.getHttpServer()).get('/admin/local-plugins').expect(401);
    permissions = ['plugin:read'];
    await request(app.getHttpServer()).get('/admin/local-plugins').expect(200);
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/install')
      .send({ confirmation: 'tyravex.support-center' })
      .expect(403);
    expect(service.install).not.toHaveBeenCalled();
  });
  it('never accepts uploaded SQL or a spoofed actor', async () => {
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/install')
      .send({
        confirmation: 'tyravex.support-center',
        sql: 'DROP SCHEMA public CASCADE',
        actorId: 99,
      })
      .expect(400);
    expect(service.install).not.toHaveBeenCalled();
  });
  it('passes only the authenticated actor and explicit confirmation to the installer', async () => {
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/install')
      .send({ confirmation: 'tyravex.support-center' })
      .expect(201);
    expect(service.install).toHaveBeenCalledWith(
      'tyravex.support-center',
      7,
      'tyravex.support-center',
    );
  });
  it('requires an explicit boolean data retention choice and delete permission', async () => {
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/uninstall')
      .send({ confirmation: 'tyravex.support-center' })
      .expect(400);
    permissions = ['plugin:read', 'plugin:manage'];
    await request(app.getHttpServer())
      .post('/admin/local-plugins/tyravex.support-center/uninstall')
      .send({ confirmation: 'tyravex.support-center', deleteData: true })
      .expect(403);
    expect(service.uninstall).not.toHaveBeenCalled();
  });
});

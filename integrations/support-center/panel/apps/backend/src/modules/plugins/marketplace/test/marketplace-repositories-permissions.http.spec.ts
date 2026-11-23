import { NativePluginCatalogService } from '../native/native-plugin-catalog.service';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { MarketplaceRepositoriesController } from '../marketplace-repositories.controller';
import { MarketplaceRepositoriesService } from '../marketplace-repositories.service';
import { MarketplaceCommunityRegistryService } from '../marketplace-community-registry.service';
import { MarketplaceRegistryService } from '../marketplace-registry.service';

describe('Marketplace repository permissions HTTP', () => {
  let app: INestApplication;

  const services = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getOfficialRegistry: jest.fn(),
    getNativeCatalog: jest
      .fn()
      .mockResolvedValue({ status: 'AVAILABLE', plugins: [] }),
    getRegistry: jest.fn(),
  };

  const allServiceMocks = Object.values(services);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceRepositoriesController],
      providers: [
        {
          provide: NativePluginCatalogService,
          useValue: { getCatalog: services.getNativeCatalog },
        },
        Reflector,
        PermissionsGuard,
        {
          provide: MarketplaceRepositoriesService,
          useValue: {
            list: services.list,
            getById: services.getById,
            create: services.create,
            update: services.update,
            remove: services.remove,
          },
        },
        {
          provide: MarketplaceCommunityRegistryService,
          useValue: {
            getRegistry: services.getRegistry,
          },
        },
        {
          provide: MarketplaceRegistryService,
          useValue: {
            getOfficialRegistry: services.getOfficialRegistry,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string | string[] | undefined>;
            user?: {
              id: number;
              permissions: string[];
            };
          }>();

          const authHeader = req.headers['x-test-auth'];
          const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;

          if (auth !== 'valid') {
            throw new UnauthorizedException();
          }

          const permissionHeader = req.headers['x-test-permission'];

          const permission = Array.isArray(permissionHeader)
            ? permissionHeader[0]
            : permissionHeader;

          req.user = {
            id: 7,
            permissions: permission ? [permission] : [],
          };

          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication({
      logger: false,
    });

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();

    services.list.mockResolvedValue([{ id: 'repo-1', isOfficial: true }]);

    services.getById.mockResolvedValue({
      id: 'repo-1',
      isOfficial: true,
      url: 'https://example.test/registry',
    });

    services.getOfficialRegistry.mockResolvedValue({
      plugins: [],
    });

    services.getRegistry.mockResolvedValue({
      plugins: [],
    });

    services.create.mockResolvedValue({
      id: 'repo-2',
    });

    services.update.mockResolvedValue({
      id: 'repo-1',
    });

    services.remove.mockResolvedValue(undefined);
  });

  type RouteName =
    | 'list'
    | 'details'
    | 'plugins'
    | 'create'
    | 'update'
    | 'delete';

  const routes: Array<{
    name: RouteName;
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    permission: string;
    successStatus: number;
    service: jest.Mock;
  }> = [
    {
      name: 'list',
      method: 'GET',
      path: '/admin/plugins/marketplace/repositories',
      permission: 'plugin:read',
      successStatus: 200,
      service: services.list,
    },
    {
      name: 'details',
      method: 'GET',
      path: '/admin/plugins/marketplace/repositories/repo-1',
      permission: 'plugin:read',
      successStatus: 200,
      service: services.getById,
    },
    {
      name: 'plugins',
      method: 'GET',
      path: '/admin/plugins/marketplace/repositories/repo-1/plugins',
      permission: 'plugin:read',
      successStatus: 200,
      service: services.getById,
    },
    {
      name: 'create',
      method: 'POST',
      path: '/admin/plugins/marketplace/repositories',
      permission: 'marketplace:manage',
      successStatus: 201,
      service: services.create,
    },
    {
      name: 'update',
      method: 'PATCH',
      path: '/admin/plugins/marketplace/repositories/repo-1',
      permission: 'marketplace:manage',
      successStatus: 200,
      service: services.update,
    },
    {
      name: 'delete',
      method: 'DELETE',
      path: '/admin/plugins/marketplace/repositories/repo-1',
      permission: 'marketplace:manage',
      successStatus: 204,
      service: services.remove,
    },
  ];

  const send = (
    route: (typeof routes)[number],
    permission?: string,
    authenticated = true,
  ) => {
    const server = app.getHttpServer();

    const req =
      route.method === 'GET'
        ? request(server).get(route.path)
        : route.method === 'POST'
          ? request(server).post(route.path)
          : route.method === 'PATCH'
            ? request(server).patch(route.path)
            : request(server).delete(route.path);

    if (authenticated) {
      req.set('x-test-auth', 'valid');
    }

    if (permission) {
      req.set('x-test-permission', permission);
    }

    if (route.method === 'POST') {
      req.send({
        name: 'Example Repository',
        url: 'https://example.test/registry',
      });
    }

    if (route.method === 'PATCH') {
      req.send({
        name: 'Updated Repository',
      });
    }

    return req;
  };

  const expectNoServiceCalls = () => {
    for (const mock of allServiceMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  };

  describe.each(routes)('$method $path', (route) => {
    it('returns 401 without authentication', async () => {
      await send(route, undefined, false).expect(401);

      expectNoServiceCalls();
    });

    it('returns 403 without permissions', async () => {
      await send(route).expect(403);

      expectNoServiceCalls();
    });

    it('returns 403 with only plugin:manage', async () => {
      await send(route, 'plugin:manage').expect(403);

      expectNoServiceCalls();
    });

    it('allows the exact required permission', async () => {
      await send(route, route.permission).expect(route.successStatus);

      expect(route.service).toHaveBeenCalledTimes(1);
    });

    it('rejects the other repository permission', async () => {
      const otherPermission =
        route.permission === 'plugin:read'
          ? 'marketplace:manage'
          : 'plugin:read';

      await send(route, otherPermission).expect(403);

      expectNoServiceCalls();
    });
  });
});

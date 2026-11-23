import { NativePluginCatalogService } from '../native/native-plugin-catalog.service';
import 'reflect-metadata';

import { HttpStatus, NotFoundException, RequestMethod } from '@nestjs/common';

import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';
import { PERMISSIONS_KEY } from '@/rbac/decorators/permissions.decorator';

import { MarketplaceRepositoriesController } from '../marketplace-repositories.controller';
import { MarketplaceCommunityRegistryService } from '../marketplace-community-registry.service';
import { MarketplaceRegistryService } from '../marketplace-registry.service';
import { MarketplaceRepositoriesService } from '../marketplace-repositories.service';

describe('MarketplaceRepositoriesController', () => {
  const repository = {
    id: 'repo-1',
    name: 'Community Plugins',
    url: 'https://plugins.example.org/registry.json',
    isOfficial: false,
    status: 'DISABLED' as const,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  };

  const officialRepository = {
    id: 'official',
    name: 'Tyravex Official',
    url: 'https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/registry.json',
    isOfficial: true,
    status: 'ENABLED' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const registry = {
    schemaVersion: 1,
    plugins: [],
  };

  const service = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const communityRegistryService = {
    getRegistry: jest.fn(),
  };

  const officialRegistryService = {
    getOfficialRegistry: jest.fn(),
  };

  const nativeCatalog = { getCatalog: jest.fn() };
  let controller: MarketplaceRepositoriesController;

  beforeEach(() => {
    jest.clearAllMocks();
    nativeCatalog.getCatalog.mockResolvedValue({
      status: 'AVAILABLE',
      plugins: [],
    });

    controller = new MarketplaceRepositoriesController(
      service as unknown as MarketplaceRepositoriesService,
      communityRegistryService as unknown as MarketplaceCommunityRegistryService,
      officialRegistryService as unknown as MarketplaceRegistryService,
      nativeCatalog as unknown as NativePluginCatalogService,
    );
  });

  it('returns repositories', async () => {
    service.list.mockResolvedValue({
      repositories: [officialRepository, repository],
    });

    await expect(controller.list()).resolves.toEqual({
      repositories: [officialRepository, repository],
    });

    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('returns repository details', async () => {
    service.getById.mockResolvedValue(repository);

    await expect(controller.getById('repo-1')).resolves.toEqual(repository);

    expect(service.getById).toHaveBeenCalledWith('repo-1');
  });

  it('returns official registry plugins', async () => {
    service.getById.mockResolvedValue(officialRepository);
    officialRegistryService.getOfficialRegistry.mockResolvedValue(registry);

    await expect(controller.listPlugins('official')).resolves.toEqual({
      ...registry,
      nativeCatalog: { status: 'AVAILABLE', plugins: [] },
    });

    expect(service.getById).toHaveBeenCalledWith('official');
    expect(officialRegistryService.getOfficialRegistry).toHaveBeenCalledTimes(
      1,
    );

    expect(communityRegistryService.getRegistry).not.toHaveBeenCalled();
  });

  it('returns community registry plugins', async () => {
    service.getById.mockResolvedValue(repository);
    communityRegistryService.getRegistry.mockResolvedValue(registry);

    await expect(controller.listPlugins('repo-1')).resolves.toEqual(registry);

    expect(communityRegistryService.getRegistry).toHaveBeenCalledWith(
      repository.url,
    );

    expect(officialRegistryService.getOfficialRegistry).not.toHaveBeenCalled();
  });

  it('does not fetch plugins for a missing repository', async () => {
    service.getById.mockRejectedValue(
      new NotFoundException('Repository not found.'),
    );

    await expect(controller.listPlugins('missing')).rejects.toThrow(
      NotFoundException,
    );

    expect(officialRegistryService.getOfficialRegistry).not.toHaveBeenCalled();

    expect(communityRegistryService.getRegistry).not.toHaveBeenCalled();
  });

  it('creates a repository', async () => {
    service.create.mockResolvedValue(repository);

    const dto = {
      name: repository.name,
      url: repository.url,
    };

    await expect(controller.create(dto)).resolves.toEqual(repository);

    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('updates a repository', async () => {
    service.update.mockResolvedValue({
      ...repository,
      status: 'ENABLED',
    });

    await expect(
      controller.update('repo-1', { status: 'ENABLED' }),
    ).resolves.toMatchObject({
      status: 'ENABLED',
    });

    expect(service.update).toHaveBeenCalledWith('repo-1', {
      status: 'ENABLED',
    });
  });

  it('deletes a repository', async () => {
    service.remove.mockResolvedValue(undefined);

    await expect(controller.remove('repo-1')).resolves.toBeUndefined();

    expect(service.remove).toHaveBeenCalledWith('repo-1');
  });

  it('requires authentication and permission guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      MarketplaceRepositoriesController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it.each([
    ['list', RequestMethod.GET, '/'],
    ['getById', RequestMethod.GET, ':id'],
    ['listPlugins', RequestMethod.GET, ':id/plugins'],
    ['create', RequestMethod.POST, '/'],
    ['update', RequestMethod.PATCH, ':id'],
    ['remove', RequestMethod.DELETE, ':id'],
  ] as const)(
    '%s has the correct HTTP method and route',
    (methodName, httpMethod, route) => {
      const handler = MarketplaceRepositoriesController.prototype[methodName];

      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(httpMethod);

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(route);
    },
  );

  it('uses the expected controller route', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, MarketplaceRepositoriesController),
    ).toBe('admin/plugins/marketplace/repositories');
  });

  it('requires marketplace:manage for repository mutations', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      MarketplaceRepositoriesController,
    ) as string[];

    expect(permissions).toEqual(['marketplace:manage']);
  });

  it.each(['list', 'getById', 'listPlugins'] as const)(
    '%s requires plugin:read',
    (methodName) => {
      const handler = MarketplaceRepositoriesController.prototype[methodName];

      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        'plugin:read',
      ]);
    },
  );

  it.each(['create', 'update', 'remove'] as const)(
    '%s inherits marketplace:manage',
    (methodName) => {
      const handler = MarketplaceRepositoriesController.prototype[methodName];

      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
    },
  );
  it('uses HTTP 201 for repository creation', () => {
    const handler = MarketplaceRepositoriesController.prototype.create;

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.CREATED,
    );
  });

  it('uses HTTP 204 for repository deletion', () => {
    const handler = MarketplaceRepositoriesController.prototype.remove;

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });
});

import { SUPPORT_CENTER_MANIFEST } from '@shared/types';
import { NativePluginCatalogService } from '../native/native-plugin-catalog.service';
import {
  parseNativePluginCatalog,
  NATIVE_SOURCE_REPOSITORY,
} from '../native/native-plugin-catalog.validation';
import {
  fetchOfficialRegistryJson,
  OFFICIAL_NATIVE_REGISTRY_URL,
} from '../official-registry.http';

const entry = (extra: Record<string, unknown> = {}) => ({
  id: 'tyravex.support-center',
  name: 'Support Center',
  version: '0.3.1',
  type: 'integration',
  runtime: 'native',
  distribution: 'source',
  path: 'integrations/support-center',
  repositoryUrl: NATIVE_SOURCE_REPOSITORY,
  languages: ['en', 'pl', 'de'],
  requiresHostIntegration: true,
  ...extra,
});
const response = (plugins: unknown[] = [entry()]) =>
  new Response(JSON.stringify({ schemaVersion: 1, plugins }));

describe('official native catalog', () => {
  let request: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    request = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => response());
  });
  afterEach(() => jest.restoreAllMocks());

  it('separates published and compiled versions and ignores remote executable capability claims', async () => {
    request.mockResolvedValue(
      response([
        entry({
          version: '9.0.0',
          compiledVersion: '9.0.0',
          installed: true,
          downloadUrl: 'https://evil.invalid/code.zip',
        }),
      ]),
    );
    const result = await new NativePluginCatalogService().getCatalog();
    expect(result).toMatchObject({
      status: 'AVAILABLE',
      plugins: [
        {
          publishedVersion: '9.0.0',
          compiledVersion: SUPPORT_CENTER_MANIFEST.version,
        },
      ],
    });
    expect(result.plugins[0]).not.toHaveProperty('downloadUrl');
    expect(result.plugins[0]).not.toHaveProperty('installed');
    expect(request).toHaveBeenCalledWith(
      OFFICIAL_NATIVE_REGISTRY_URL,
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it('coalesces requests, caches valid data and refreshes when explicitly requested', async () => {
    const service = new NativePluginCatalogService();
    await Promise.all([service.getCatalog(), service.getCatalog()]);
    await service.getCatalog();
    expect(request).toHaveBeenCalledTimes(1);
    await service.getCatalog(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not present expired metadata as published when GitHub is unavailable', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const service = new NativePluginCatalogService();
    await service.getCatalog();
    clock.mockReturnValue(1000 + 16 * 60_000);
    request.mockRejectedValue(new Error('Offline'));
    const result = await service.getCatalog();
    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      plugins: [
        {
          publishedVersion: null,
          compiledVersion: SUPPORT_CENTER_MANIFEST.version,
        },
      ],
    });
  });
  it('keeps unknown native plugins unavailable for installation in this panel', async () => {
    request.mockResolvedValue(
      response([entry({ id: 'tyravex.future', path: 'integrations/future' })]),
    );
    const result = await new NativePluginCatalogService().getCatalog();
    expect(
      result.plugins.find((plugin) => plugin.id === 'tyravex.future')
        ?.compiledVersion,
    ).toBeNull();
    expect(
      result.plugins.find((plugin) => plugin.id === SUPPORT_CENTER_MANIFEST.id)
        ?.publishedVersion,
    ).toBeNull();
  });
  it.each([
    { repositoryUrl: 'https://evil.invalid' },
    { path: '../outside' },
    { path: 'integrations/another-plugin' },
    { runtime: 'javascript' },
    { requiresHostIntegration: false },
    { languages: ['en', 'en'] },
    { languages: ['../outside'] },
    { version: 'invalid' },
    { name: '' },
  ])('rejects malformed or foreign source metadata: %j', (extra) => {
    expect(() =>
      parseNativePluginCatalog({ schemaVersion: 1, plugins: [entry(extra)] }),
    ).toThrow();
  });
  it('rejects duplicate IDs and invalid schemas', () => {
    expect(() =>
      parseNativePluginCatalog({ schemaVersion: 2, plugins: [] }),
    ).toThrow();
    expect(() =>
      parseNativePluginCatalog({
        schemaVersion: 1,
        plugins: [entry(), entry()],
      }),
    ).toThrow();
  });
  it('refuses arbitrary fetch URLs before performing a request', async () => {
    await expect(
      fetchOfficialRegistryJson('http://127.0.0.1/private'),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('enforces response size even when content-length is omitted', async () => {
    request.mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)));
    await expect(
      fetchOfficialRegistryJson(OFFICIAL_NATIVE_REGISTRY_URL),
    ).rejects.toThrow('Registry too large');
  });
  it('rejects invalid UTF-8 JSON and failed HTTP responses', async () => {
    request.mockResolvedValue(new Response(new Uint8Array([0xff])));
    await expect(
      fetchOfficialRegistryJson(OFFICIAL_NATIVE_REGISTRY_URL),
    ).rejects.toThrow();
    request.mockResolvedValue(new Response('', { status: 503 }));
    await expect(
      fetchOfficialRegistryJson(OFFICIAL_NATIVE_REGISTRY_URL),
    ).rejects.toThrow('503');
  });
});

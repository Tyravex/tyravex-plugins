import { Injectable } from '@nestjs/common';
import { SUPPORT_CENTER_MANIFEST } from '@shared/types';
import type {
  NativeMarketplaceCatalog,
  NativeMarketplacePlugin,
} from '@shared/types';
import {
  fetchOfficialRegistryJson,
  OFFICIAL_NATIVE_REGISTRY_URL,
} from '../official-registry.http';
import {
  NATIVE_SOURCE_REPOSITORY,
  parseNativePluginCatalog,
} from './native-plugin-catalog.validation';

const compiledSupport: NativeMarketplacePlugin = {
  id: SUPPORT_CENTER_MANIFEST.id,
  name: 'Support Center',
  runtime: 'native',
  type: 'integration',
  repositoryUrl: NATIVE_SOURCE_REPOSITORY,
  path: 'integrations/support-center',
  languages: [...SUPPORT_CENTER_MANIFEST.translations.languages],
  publishedVersion: null,
  compiledVersion: SUPPORT_CENTER_MANIFEST.version,
};

@Injectable()
export class NativePluginCatalogService {
  private cached: NativeMarketplaceCatalog | null = null;
  private expiresAt = 0;
  private inFlight: Promise<NativeMarketplaceCatalog> | null = null;

  async getCatalog(refresh = false): Promise<NativeMarketplaceCatalog> {
    if (!refresh && this.cached && Date.now() < this.expiresAt)
      return this.cached;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchCatalog();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchCatalog(): Promise<NativeMarketplaceCatalog> {
    let catalog: NativeMarketplaceCatalog;
    try {
      const entries = parseNativePluginCatalog(
        await fetchOfficialRegistryJson(OFFICIAL_NATIVE_REGISTRY_URL),
      );
      const plugins: NativeMarketplacePlugin[] = entries.map(
        ({ version, ...entry }) => ({
          ...entry,
          publishedVersion: version,
          compiledVersion:
            entry.id === compiledSupport.id
              ? compiledSupport.compiledVersion
              : null,
        }),
      );
      if (!plugins.some((entry) => entry.id === compiledSupport.id))
        plugins.push({ ...compiledSupport });
      catalog = { status: 'AVAILABLE', plugins };
    } catch {
      // Preserve access to bundled administration, but do not claim stale data is published.
      catalog = { status: 'UNAVAILABLE', plugins: [{ ...compiledSupport }] };
    }
    this.cached = catalog;
    this.expiresAt =
      Date.now() + (catalog.status === 'AVAILABLE' ? 15 * 60_000 : 30_000);
    return catalog;
  }
}

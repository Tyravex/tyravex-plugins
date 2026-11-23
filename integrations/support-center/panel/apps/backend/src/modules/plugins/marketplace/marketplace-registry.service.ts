import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { MarketplacePlugin, MarketplaceRegistry } from '@shared/types';

import {
  fetchOfficialRegistryJson,
  OFFICIAL_REGISTRY_URL,
} from './official-registry.http';

const CACHE_MS = 15 * 60 * 1000;
const MAX_PLUGINS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlugin(value: unknown): value is MarketplacePlugin {
  if (!isRecord(value)) {
    return false;
  }

  const requiredFields = [
    'id',
    'name',
    'description',
    'type',
    'version',
    'downloadUrl',
    'sha256',
  ] as const;

  for (const key of requiredFields) {
    if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
      return false;
    }
  }

  if (!/^[a-f0-9]{64}$/i.test(value.sha256 as string)) {
    return false;
  }

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version as string)) {
    return false;
  }

  try {
    const url = new URL(value.downloadUrl as string);

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return false;
    }

    if (
      !url.pathname.startsWith('/Tyravex/tyravex-plugins/releases/download/')
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function parseRegistry(value: unknown): MarketplaceRegistry {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.plugins)
  ) {
    throw new Error('Invalid marketplace registry schema');
  }

  if (value.plugins.length > MAX_PLUGINS || !value.plugins.every(isPlugin)) {
    throw new Error('Invalid marketplace plugin entries');
  }

  const plugins = value.plugins as MarketplacePlugin[];
  const ids = new Set<string>();

  for (const plugin of plugins) {
    if (ids.has(plugin.id)) {
      throw new Error('Duplicate marketplace plugin ID');
    }

    ids.add(plugin.id);
  }

  return {
    schemaVersion: 1,
    plugins,
  };
}

@Injectable()
export class MarketplaceRegistryService {
  private cached: MarketplaceRegistry | null = null;
  private expiresAt = 0;
  private inFlight: Promise<MarketplaceRegistry> | null = null;

  async getOfficialRegistry(refresh = false): Promise<MarketplaceRegistry> {
    if (!refresh && this.cached && Date.now() < this.expiresAt) {
      return this.cached;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.fetchOfficialRegistry();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchOfficialRegistry(): Promise<MarketplaceRegistry> {
    try {
      const parsed = await fetchOfficialRegistryJson(OFFICIAL_REGISTRY_URL);

      const registry = parseRegistry(parsed);

      this.cached = registry;
      this.expiresAt = Date.now() + CACHE_MS;

      return registry;
    } catch {
      // Never serve an expired registry as current.
      throw new ServiceUnavailableException(
        'Official plugin registry is unavailable or invalid',
      );
    }
  }
}

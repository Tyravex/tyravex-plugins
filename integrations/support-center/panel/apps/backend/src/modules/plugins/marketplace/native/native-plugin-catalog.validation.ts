import type { NativeMarketplacePlugin } from '@shared/types';

type SourceEntry = Omit<
  NativeMarketplacePlugin,
  'publishedVersion' | 'compiledVersion'
> & { version: string };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const NATIVE_SOURCE_REPOSITORY =
  'https://github.com/Tyravex/tyravex-plugins';

export function parseNativePluginCatalog(value: unknown): SourceEntry[] {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.plugins) ||
    value.plugins.length > 100
  )
    throw new Error('Invalid native plugin catalog');
  const ids = new Set<string>();
  return value.plugins.map((entry: unknown) => {
    if (
      !record(entry) ||
      typeof entry.id !== 'string' ||
      !/^tyravex\.[a-z0-9][a-z0-9.-]{0,95}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 120 ||
      typeof entry.version !== 'string' ||
      !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(entry.version) ||
      entry.runtime !== 'native' ||
      entry.type !== 'integration' ||
      entry.distribution !== 'source' ||
      entry.repositoryUrl !== NATIVE_SOURCE_REPOSITORY ||
      entry.requiresHostIntegration !== true ||
      typeof entry.path !== 'string' ||
      !/^integrations\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.path) ||
      (entry.id === 'tyravex.support-center' &&
        entry.path !== 'integrations/support-center') ||
      !Array.isArray(entry.languages) ||
      !entry.languages.length ||
      entry.languages.length > 20 ||
      !entry.languages.every(
        (language: unknown) =>
          typeof language === 'string' &&
          /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language),
      ) ||
      new Set(entry.languages).size !== entry.languages.length
    )
      throw new Error('Invalid native plugin entry');
    ids.add(entry.id);
    // Never forward remote claims about locally compiled code or installation state.
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      runtime: 'native',
      type: 'integration',
      repositoryUrl: NATIVE_SOURCE_REPOSITORY,
      path: entry.path,
      languages: entry.languages as string[],
    };
  });
}

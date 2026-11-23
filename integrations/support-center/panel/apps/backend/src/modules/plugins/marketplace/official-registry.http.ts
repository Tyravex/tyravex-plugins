export const OFFICIAL_REGISTRY_URL =
  'https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/registry.json';
export const OFFICIAL_NATIVE_REGISTRY_URL =
  'https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/native-plugins.json';

/** Fixed official endpoints only; community repositories use their own DNS/SSRF policy. */
export async function fetchOfficialRegistryJson(url: string): Promise<unknown> {
  if (![OFFICIAL_REGISTRY_URL, OFFICIAL_NATIVE_REGISTRY_URL].includes(url))
    throw new Error('Unsupported official registry endpoint');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
  const maxBytes = 1024 * 1024;
  const lengthHeader = response.headers.get('content-length');
  const length = Number(lengthHeader);
  if (
    lengthHeader !== null &&
    (!Number.isSafeInteger(length) || length < 0 || length > maxBytes)
  )
    throw new Error('Registry too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing registry response body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Registry too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

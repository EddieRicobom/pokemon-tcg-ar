/** Workbox serializa estas regras para outro arquivo: não podem capturar variáveis do Vite. */
export function runtimeAssetPattern(base: string, path: string, exact = false): RegExp {
  const escaped = `${base}${path}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https?://[^/]+${escaped}${exact ? '(?:\\?.*)?$' : ''}`);
}

import { onBeforeUnmount, ref } from 'vue';

export type RouteName = 'escanear' | 'varias' | 'caixa' | 'carregar' | 'treinador' | 'diagnostico';

export interface Route {
  name: RouteName;
  /** Id de carta (ex.: "base1-58") quando a rota é `#/escanear/base1-58` (carta carregada do cache). */
  cardId?: string;
}

/**
 * Rotas por hash (`#/carregar`): funcionam no GitHub Pages sem reescrita de URL e sem página 404.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [first, ...rest] = path.split('/');
  if (first === 'varias') return { name: 'varias' };
  if (first === 'caixa') return { name: 'caixa' };
  if (first === 'carregar') return { name: 'carregar' };
  if (first === 'treinador') return { name: 'treinador' };
  if (first === 'diagnostico') return { name: 'diagnostico' };
  const id = rest.join('/');
  return id ? { name: 'escanear', cardId: decodeURIComponent(id) } : { name: 'escanear' };
}

export function routeHref(name: RouteName, cardId?: string): string {
  if (name === 'escanear' && cardId) return `#/escanear/${encodeURIComponent(cardId)}`;
  return name === 'escanear' ? '#/' : `#/${name}`;
}

export function useRoute() {
  const route = ref<Route>(parseRoute(window.location.hash));
  const onChange = () => {
    route.value = parseRoute(window.location.hash);
  };
  window.addEventListener('hashchange', onChange);
  onBeforeUnmount(() => window.removeEventListener('hashchange', onChange));
  return route;
}

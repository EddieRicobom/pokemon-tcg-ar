import { onBeforeUnmount, ref } from 'vue';

export type RouteName = 'escanear' | 'varias' | 'vila' | 'caixa' | 'pins' | 'carregar' | 'treinador' | 'diagnostico';

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
  if (first === 'vila') return { name: 'vila' };
  if (first === 'caixa') return { name: 'caixa' };
  if (first === 'pins') return { name: 'pins' };
  if (first === 'carregar') return { name: 'carregar' };
  if (first === 'treinador') return { name: 'treinador' };
  if (first === 'diagnostico') return { name: 'diagnostico' };
  const id = rest.join('/');
  return id ? { name: 'escanear', cardId: decodeURIComponent(id) } : { name: 'escanear' };
}

/**
 * Sinalizadores que a Vila põe no endereço (`#/pins?vila=1`) para as outras telas saberem de onde você veio:
 * `vila` = «veio da Vila» (a tela mostra «Voltar à Vila»), `pvp` = abrir o PvP da Caixa, `batalha` = veio do
 * Fliperama para uma batalha na câmera (a Caixa destaca «Abrir câmera e batalhar») e `jogos` = o Treinador abre nos minigames.
 */
export type RouteFlag = 'vila' | 'pvp' | 'batalha' | 'jogos';
const FLAGS: readonly RouteFlag[] = ['vila', 'pvp', 'batalha', 'jogos'];

export function routeFlags(hash: string): Set<RouteFlag> {
  const query = hash.split('?')[1] ?? '';
  const out = new Set<RouteFlag>();
  for (const part of query.split('&')) {
    const key = part.split('=')[0] as RouteFlag;
    if (FLAGS.includes(key)) out.add(key);
  }
  return out;
}

export function routeHref(name: RouteName, cardId?: string, flags: readonly RouteFlag[] = []): string {
  const base = name === 'escanear' && cardId ? `#/escanear/${encodeURIComponent(cardId)}` : name === 'escanear' ? '#/' : `#/${name}`;
  return flags.length > 0 ? `${base}?${flags.map((f) => `${f}=1`).join('&')}` : base;
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

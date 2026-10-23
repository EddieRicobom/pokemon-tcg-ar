import { onBeforeUnmount, ref } from 'vue';

export type RouteName = 'escanear' | 'varias' | 'vila' | 'cartas' | 'caixa' | 'arena' | 'pins' | 'treinador' | 'diagnostico';

export interface Route {
  name: RouteName;
  /** Id de carta (ex.: "base1-58") quando a rota é `#/escanear/base1-58` (carta carregada do cache). */
  cardId?: string;
}

/**
 * Rotas antigas que viraram outras (o endereço é trocado ao abrir, para links e atalhos guardados continuarem valendo):
 * `#/carregar` era «Minhas cartas» como modo do Escanear; hoje é a primeira sub-aba de Cartas (`#/cartas`).
 */
const OLD_ROUTES: Record<string, RouteName> = { carregar: 'cartas' };

/** Endereço novo de um endereço antigo (mantém os sinalizadores depois do `?`), ou null se o endereço já é atual. */
export function redirectFor(hash: string): string | null {
  const [path = '', query] = hash.replace(/^#\/?/, '').split('?');
  const target = OLD_ROUTES[path.split('/')[0] ?? ''];
  if (!target) return null;
  return query ? `${routeHref(target)}?${query}` : routeHref(target);
}

/**
 * Rotas por hash (`#/cartas`): funcionam no GitHub Pages sem reescrita de URL e sem página 404.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [first, ...rest] = path.split('/');
  if (first === 'varias') return { name: 'varias' };
  if (first === 'vila') return { name: 'vila' };
  if (first === 'cartas') return { name: 'cartas' };
  if (first === 'caixa') return { name: 'caixa' };
  if (first === 'arena') return { name: 'arena' };
  if (first === 'pins') return { name: 'pins' };
  const old = OLD_ROUTES[first ?? ''];
  if (old) return { name: old };
  if (first === 'treinador') return { name: 'treinador' };
  if (first === 'diagnostico') return { name: 'diagnostico' };
  const id = rest.join('/');
  return id ? { name: 'escanear', cardId: decodeURIComponent(id) } : { name: 'escanear' };
}

/**
 * Sinalizadores que a Vila põe no endereço (`#/pins?vila=1`) para as outras telas saberem de onde você veio:
 * `vila` = «veio da Vila» (a tela mostra «Voltar à Vila»), `pvp` = abrir o PvP da Caixa, `batalha` = veio do
 * Fliperama para uma batalha na câmera, `formatacao`/`restauracao` levam o modo contínuo escolhido da Arena até a Caixa
 * `jogos` = o Treinador abre nos minigames e `virtual` = a Caixa abre na Arena 3D (palco virtual, sem câmera).
 */
export type RouteFlag = 'vila' | 'pvp' | 'batalha' | 'formatacao' | 'restauracao' | 'jogos' | 'virtual';
const FLAGS: readonly RouteFlag[] = ['vila', 'pvp', 'batalha', 'formatacao', 'restauracao', 'jogos', 'virtual'];

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

/** Como a Vila se despede (o `emit('close', …)` do `VillageView`): cada saída leva a uma tela da Caixa, já com os sinalizadores. */
export type VilaExit = 'pvp' | 'batalha' | 'batalha3d' | 'caixa' | 'arena3d';

/**
 * Endereço da Caixa para cada saída da Vila: PvP e batalha do Fliperama abrem a câmera (como sempre), a Caixa em AR
 * abre a câmera sem mais nada, e a Arena 3D (e a batalha do Fliperama na Arena 3D) abre o palco virtual, sem câmera.
 * Quem vem do Coliseu leva `vila`, para a Caixa oferecer «Voltar à Vila».
 */
export function vilaExitHref(then: VilaExit): string {
  switch (then) {
    case 'pvp': return routeHref('caixa', undefined, ['pvp']);
    case 'batalha': return routeHref('caixa', undefined, ['batalha']);
    case 'batalha3d': return routeHref('caixa', undefined, ['batalha', 'virtual']);
    case 'caixa': return routeHref('caixa', undefined, ['vila']);
    case 'arena3d': return routeHref('caixa', undefined, ['virtual', 'vila']);
  }
}

/** Os sinalizadores de uma luta que sai da Arena Digital: o modo escolhido mais o fundo (`virtual` = Arena 3D, sem câmera). */
export function arenaFlags(extra: readonly RouteFlag[], virtual: boolean): RouteFlag[] {
  return virtual ? [...extra, 'virtual'] : [...extra];
}

export function useRoute() {
  const route = ref<Route>(parseRoute(window.location.hash));
  const onChange = () => {
    const next = redirectFor(window.location.hash);
    if (next) window.history.replaceState(null, '', next);
    route.value = parseRoute(window.location.hash);
  };
  onChange();
  window.addEventListener('hashchange', onChange);
  onBeforeUnmount(() => window.removeEventListener('hashchange', onChange));
  return route;
}

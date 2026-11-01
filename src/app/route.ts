import { onBeforeUnmount, ref } from 'vue';

export type RouteName = 'escanear' | 'varias' | 'vila' | 'torre' | 'cartas' | 'caixa' | 'arena' | 'pins' | 'treinador' | 'diagnostico';

export interface Route {
  name: RouteName;
  /** Id de carta (ex.: "base1-58") quando a rota é `#/escanear/base1-58` (carta carregada do cache). */
  cardId?: string;
}

/**
 * Rotas antigas que viraram outras (o endereço é trocado ao abrir, para links e atalhos guardados continuarem valendo):
 * `#/carregar` era «Minhas cartas» como modo do Escanear; hoje é a primeira sub-aba de Cartas (`#/cartas`).
 */
const OLD_ROUTES: ReadonlyMap<string, RouteName> = new Map([['carregar', 'cartas']]);

/** Endereço novo de um endereço antigo (mantém os sinalizadores depois do `?`), ou null se o endereço já é atual. */
export function redirectFor(hash: string): string | null {
  const [path = '', query] = hash.replace(/^#\/?/, '').split('?');
  const target = OLD_ROUTES.get(path.split('/')[0] ?? '');
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
  if (first === 'torre') return { name: 'torre' };
  if (first === 'cartas') return { name: 'cartas' };
  if (first === 'caixa') return { name: 'caixa' };
  if (first === 'arena') return { name: 'arena' };
  if (first === 'pins') return { name: 'pins' };
  const old = OLD_ROUTES.get(first ?? '');
  if (old) return { name: old };
  if (first === 'treinador') return { name: 'treinador' };
  if (first === 'diagnostico') return { name: 'diagnostico' };
  const id = rest.join('/');
  if (!id) return { name: 'escanear' };
  try { return { name: 'escanear', cardId: decodeURIComponent(id) }; }
  catch { return { name: 'escanear' }; }
}

/**
 * Sinalizadores que a Vila põe no endereço (`#/pins?vila=1`) para as outras telas saberem de onde você veio:
 * `vila` = «veio da Vila» (a tela mostra «Voltar à Vila»). No menu da Arena (`#/arena`) dizem a opção já escolhida:
 * `pvp` (PvP com um amigo), `batalha` (batalha livre, vinda do Fliperama), `liga` e `corridas`. `formatacao`/`restauracao`
 * levam a corrida escolhida até o palco (`#/caixa`);
 * `jogos` = o Treinador abre nos minigames, `autoiniciar` entra e começa uma batalha assim que a Arena estiver pronta.
 * `virtual` é mantido em links antigos, mas a Arena é sempre virtual.
 * `bonk` e `coliseu` são atalhos de jogo dentro da Vila. A Torre comum abre em `#/torre`, uma rota própria que volta
 * para a Vila sem deixar seu mapa montado atrás da corrida.
 */
export type RouteFlag = 'vila' | 'arena' | 'golpes' | 'pvp' | 'batalha' | 'liga' | 'corridas' | 'formatacao' | 'restauracao' | 'jogos' | 'virtual' | 'autoiniciar' | GameShortcut;
const FLAGS: readonly RouteFlag[] = ['vila', 'arena', 'golpes', 'pvp', 'batalha', 'liga', 'corridas', 'formatacao', 'restauracao', 'jogos', 'virtual', 'autoiniciar', 'torre', 'bonk', 'coliseu'];

/** Jogos que a Vila abre direto pelo endereço. */
export type GameShortcut = 'torre' | 'bonk' | 'coliseu';
const GAME_SHORTCUTS: readonly GameShortcut[] = ['torre', 'bonk', 'coliseu'];

/** Endereço que abre a Vila já dentro do jogo. */
export function gameHref(game: GameShortcut): string {
  return game === 'torre' ? routeHref('torre', undefined, ['vila']) : routeHref('vila', undefined, [game]);
}

/** O atalho de jogo pedido pelo endereço, se houver (só o primeiro vale). */
export function gameShortcutOf(hash: string): GameShortcut | null {
  const flags = routeFlags(hash);
  return GAME_SHORTCUTS.find((game) => flags.has(game)) ?? null;
}

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

/** Como a Vila se despede (o `emit('close', …)` do `VillageView`): cada saída leva ao menu da Arena, já com a opção certa. */
export type VilaExit = 'pvp' | 'batalha' | 'batalha3d' | 'caixa' | 'arena3d';

/**
 * Endereço do menu da Arena para cada saída da Vila (`#/arena`): a pessoa escolhe equipe e opções ali, antes de entrar
 * no palco 3D (`#/caixa`, sem câmera ou sensores). Os endereços antigos `#/caixa?...` continuam abrindo o palco.
 * Todas levam `vila`: o menu oferece «Voltar à Vila» e o ✕ da Vila não volta para ele (`rememberBeforeVila`).
 */
export function vilaExitHref(then: VilaExit): string {
  switch (then) {
    case 'pvp': return routeHref('arena', undefined, ['pvp', 'vila']);
    case 'batalha':
    case 'batalha3d': return routeHref('arena', undefined, ['batalha', 'vila']);
    case 'caixa':
    case 'arena3d': return routeHref('arena', undefined, ['vila']);
  }
}

/**
 * O ✕ da Vila volta para a última tela fora dela, mas não para uma tela que a própria Vila abriu (`vila=1` no endereço:
 * a Caixa, a Arena Digital, os Pins): senão o ✕ reabriria a luta em vez de voltar de onde a pessoa veio.
 */
export function rememberBeforeVila(hash: string): boolean {
  return !routeFlags(hash).has('vila');
}

/** Os sinalizadores de uma luta que sai do menu da Arena: sempre no palco 3D, sem câmera. */
export function arenaFlags(extra: readonly RouteFlag[]): RouteFlag[] {
  return [...extra, 'virtual'];
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

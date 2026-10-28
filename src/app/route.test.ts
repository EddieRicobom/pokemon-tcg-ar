import { describe, expect, it } from 'vitest';
import { arenaFlags, gameHref, gameShortcutOf, parseRoute, redirectFor, rememberBeforeVila, routeFlags, routeHref, vilaExitHref } from './route';

describe('rotas por hash', () => {
  it('conhece a rota do Treinador', () => {
    expect(parseRoute('#/treinador')).toEqual({ name: 'treinador' });
    expect(parseRoute('#/pins')).toEqual({ name: 'pins' });
    expect(parseRoute('#/arena')).toEqual({ name: 'arena' });
    expect(routeHref('pins')).toBe('#/pins');
    expect(routeHref('treinador')).toBe('#/treinador');
  });

  it('interpreta as cinco telas e o padrão', () => {
    expect(parseRoute('')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/varias')).toEqual({ name: 'varias' });
    expect(parseRoute('#/caixa')).toEqual({ name: 'caixa' });
    expect(parseRoute('#/cartas')).toEqual({ name: 'cartas' });
    expect(parseRoute('#/diagnostico')).toEqual({ name: 'diagnostico' });
    expect(parseRoute('#/qualquer-coisa')).toEqual({ name: 'escanear' });
  });

  it('carta carregada do cache vai na própria rota (ids têm ponto e hífen)', () => {
    expect(parseRoute('#/escanear/sv03.5-025')).toEqual({ name: 'escanear', cardId: 'sv03.5-025' });
    expect(parseRoute(routeHref('escanear', 'swsh12tg-TG05'))).toEqual({ name: 'escanear', cardId: 'swsh12tg-TG05' });
  });

  it('ignora links malformados e nomes herdados do protótipo', () => {
    for (const hash of ['#/escanear/%', '#/escanear/%E0%A4%A', '#/toString', '#/constructor']) {
      expect(parseRoute(hash)).toEqual({ name: 'escanear' });
      expect(redirectFor(hash)).toBeNull();
    }
  });

  it('a Vila tem rota própria', () => {
    expect(parseRoute('#/vila')).toEqual({ name: 'vila' });
    expect(routeHref('vila')).toBe('#/vila');
    expect(routeFlags('#/caixa?batalha=1').has('batalha')).toBe(true);
  });

  it('ignora parâmetros depois de ?', () => {
    expect(parseRoute('#/cartas?x=1')).toEqual({ name: 'cartas' });
  });

  it('monta os endereços', () => {
    expect(routeHref('escanear')).toBe('#/');
    expect(routeHref('varias')).toBe('#/varias');
    expect(routeHref('caixa')).toBe('#/caixa');
    expect(routeHref('arena')).toBe('#/arena');
    expect(routeHref('cartas')).toBe('#/cartas');
    expect(routeHref('diagnostico')).toBe('#/diagnostico');
  });

  it('a rota antiga de Minhas cartas (#/carregar) leva às Cartas, mantendo o que vem depois do ?', () => {
    expect(parseRoute('#/carregar')).toEqual({ name: 'cartas' });
    expect(redirectFor('#/carregar')).toBe('#/cartas');
    expect(redirectFor('#/carregar?vila=1')).toBe('#/cartas?vila=1');
    expect(redirectFor('#/cartas')).toBeNull();
    expect(redirectFor('#/caixa?batalha=1')).toBeNull();
    expect(redirectFor('')).toBeNull();
  });

  it('sinalizadores da Vila vão depois do ? e não mudam a rota', () => {
    expect(routeHref('pins', undefined, ['vila'])).toBe('#/pins?vila=1');
    expect(routeHref('caixa', undefined, ['vila', 'pvp'])).toBe('#/caixa?vila=1&pvp=1');
    expect(parseRoute('#/caixa?vila=1&pvp=1')).toEqual({ name: 'caixa' });
    expect([...routeFlags('#/caixa?vila=1&pvp=1')].sort()).toEqual(['pvp', 'vila']);
    expect([...routeFlags('#/pins?vila=1')]).toEqual(['vila']);
    expect(routeFlags('#/pins').size).toBe(0);
    expect(routeFlags('#/pins?outra=1&vila').has('vila')).toBe(true);
    expect(routeFlags('#/pins?outra=1').size).toBe(0);
    expect([...routeFlags('#/caixa?formatacao=1')]).toEqual(['formatacao']);
    expect([...routeFlags('#/caixa?virtual=1&batalha=1')].sort()).toEqual(['batalha', 'virtual']);
    expect(routeHref('caixa', undefined, ['virtual'])).toBe('#/caixa?virtual=1');
  });
});

describe('atalhos de jogo', () => {
  it('cada atalho abre a Vila e é reconhecido pelo endereço', () => {
    expect(gameHref('torre')).toBe('#/vila?torre=1');
    expect(gameHref('bonk')).toBe('#/vila?bonk=1');
    expect(gameHref('coliseu')).toBe('#/vila?coliseu=1');
    for (const game of ['torre', 'bonk', 'coliseu'] as const) {
      expect(parseRoute(gameHref(game))).toEqual({ name: 'vila' });
      expect(gameShortcutOf(gameHref(game))).toBe(game);
    }
  });

  it('sem atalho, ou com outros sinalizadores, não abre jogo nenhum', () => {
    expect(gameShortcutOf('#/vila')).toBeNull();
    expect(gameShortcutOf('#/vila?vila=1')).toBeNull();
    expect(gameShortcutOf('#/treinador?jogos=1')).toBeNull();
  });

  it('o atalho não conta como «veio da Vila» para o ✕ voltar', () => {
    expect(rememberBeforeVila(gameHref('torre'))).toBe(true);
  });
});

describe('saídas da Vila e da Arena Digital', () => {
  it('cada saída da Vila leva à Arena 3D', () => {
    expect(vilaExitHref('pvp')).toBe('#/caixa?pvp=1&virtual=1&vila=1');
    expect(vilaExitHref('batalha')).toBe('#/caixa?batalha=1&virtual=1&vila=1');
    expect(vilaExitHref('batalha3d')).toBe('#/caixa?batalha=1&virtual=1&vila=1');
    expect(vilaExitHref('caixa')).toBe('#/caixa?virtual=1&vila=1');
    expect(vilaExitHref('arena3d')).toBe('#/caixa?virtual=1&vila=1');
  });

  it('todas as saídas da Vila usam a Arena 3D, sem câmera', () => {
    const virtual = (then: Parameters<typeof vilaExitHref>[0]) => routeFlags(vilaExitHref(then)).has('virtual');
    expect(virtual('arena3d')).toBe(true);
    expect(virtual('batalha3d')).toBe(true);
    expect(virtual('caixa')).toBe(true);
    expect(virtual('batalha')).toBe(true);
    expect(virtual('pvp')).toBe(true);
  });

  it('as saídas da Vila voltam a ser lidas pelas mesmas funções da Caixa', () => {
    for (const then of ['pvp', 'batalha', 'batalha3d', 'caixa', 'arena3d'] as const) expect(parseRoute(vilaExitHref(then))).toEqual({ name: 'caixa' });
  });

  it('a Arena Digital sempre acrescenta o palco virtual, sem mexer na lista original', () => {
    const base = ['formatacao'] as const;
    expect(arenaFlags(base)).toEqual(['formatacao', 'virtual']);
    expect(arenaFlags([])).toEqual(['virtual']);
    expect(base).toEqual(['formatacao']);
    expect(routeHref('caixa', undefined, arenaFlags(['restauracao']))).toBe('#/caixa?restauracao=1&virtual=1');
  });
});

describe('para onde o ✕ da Vila volta', () => {
  it('não guarda telas que a própria Vila abriu', () => {
    for (const then of ['pvp', 'batalha', 'batalha3d', 'caixa', 'arena3d'] as const) expect(rememberBeforeVila(vilaExitHref(then))).toBe(false);
    expect(rememberBeforeVila('#/pins?vila=1')).toBe(false);
    expect(rememberBeforeVila('#/arena?vila=1')).toBe(false);
  });

  it('guarda as telas abertas de outro jeito (menu, links, endereço)', () => {
    for (const hash of ['#/', '#/cartas', '#/caixa', '#/caixa?virtual=1', '#/arena?formatacao=1', '#/pins']) expect(rememberBeforeVila(hash)).toBe(true);
  });
});

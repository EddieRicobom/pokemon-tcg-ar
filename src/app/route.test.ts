import { describe, expect, it } from 'vitest';
import { parseRoute, routeFlags, routeHref } from './route';

describe('rotas por hash', () => {
  it('conhece a rota do Treinador', () => {
    expect(parseRoute('#/treinador')).toEqual({ name: 'treinador' });
    expect(parseRoute('#/pins')).toEqual({ name: 'pins' });
    expect(routeHref('pins')).toBe('#/pins');
    expect(routeHref('treinador')).toBe('#/treinador');
  });

  it('interpreta as cinco telas e o padrão', () => {
    expect(parseRoute('')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/varias')).toEqual({ name: 'varias' });
    expect(parseRoute('#/caixa')).toEqual({ name: 'caixa' });
    expect(parseRoute('#/carregar')).toEqual({ name: 'carregar' });
    expect(parseRoute('#/diagnostico')).toEqual({ name: 'diagnostico' });
    expect(parseRoute('#/qualquer-coisa')).toEqual({ name: 'escanear' });
  });

  it('carta carregada do cache vai na própria rota (ids têm ponto e hífen)', () => {
    expect(parseRoute('#/escanear/sv03.5-025')).toEqual({ name: 'escanear', cardId: 'sv03.5-025' });
    expect(parseRoute(routeHref('escanear', 'swsh12tg-TG05'))).toEqual({ name: 'escanear', cardId: 'swsh12tg-TG05' });
  });

  it('a Vila tem rota própria', () => {
    expect(parseRoute('#/vila')).toEqual({ name: 'vila' });
    expect(routeHref('vila')).toBe('#/vila');
    expect(routeFlags('#/caixa?batalha=1').has('batalha')).toBe(true);
  });

  it('ignora parâmetros depois de ?', () => {
    expect(parseRoute('#/carregar?x=1')).toEqual({ name: 'carregar' });
  });

  it('monta os endereços', () => {
    expect(routeHref('escanear')).toBe('#/');
    expect(routeHref('varias')).toBe('#/varias');
    expect(routeHref('caixa')).toBe('#/caixa');
    expect(routeHref('carregar')).toBe('#/carregar');
    expect(routeHref('diagnostico')).toBe('#/diagnostico');
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
  });
});

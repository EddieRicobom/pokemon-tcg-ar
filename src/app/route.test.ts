import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './route';

describe('rotas por hash', () => {
  it('interpreta as quatro telas e o padrão', () => {
    expect(parseRoute('')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/')).toEqual({ name: 'escanear' });
    expect(parseRoute('#/caixa')).toEqual({ name: 'caixa' });
    expect(parseRoute('#/carregar')).toEqual({ name: 'carregar' });
    expect(parseRoute('#/diagnostico')).toEqual({ name: 'diagnostico' });
    expect(parseRoute('#/qualquer-coisa')).toEqual({ name: 'escanear' });
  });

  it('carta carregada do cache vai na própria rota (ids têm ponto e hífen)', () => {
    expect(parseRoute('#/escanear/sv03.5-025')).toEqual({ name: 'escanear', cardId: 'sv03.5-025' });
    expect(parseRoute(routeHref('escanear', 'swsh12tg-TG05'))).toEqual({ name: 'escanear', cardId: 'swsh12tg-TG05' });
  });

  it('ignora parâmetros depois de ?', () => {
    expect(parseRoute('#/carregar?x=1')).toEqual({ name: 'carregar' });
  });

  it('monta os endereços', () => {
    expect(routeHref('escanear')).toBe('#/');
    expect(routeHref('caixa')).toBe('#/caixa');
    expect(routeHref('carregar')).toBe('#/carregar');
    expect(routeHref('diagnostico')).toBe('#/diagnostico');
  });
});

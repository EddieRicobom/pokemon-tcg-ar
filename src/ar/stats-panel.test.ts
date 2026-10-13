import { describe, expect, it } from 'vitest';
import { StatsPanel } from './stats-panel';
import { PAGE_INTERVAL_MS, REAPPEAR_AFTER_MS } from './panel-state';

describe('StatsPanel (painel no chão)', () => {
  it('fica abaixo da borda inferior da carta, no plano dela', () => {
    const panel = new StatsPanel('Pikachu', 25);
    panel.setCardHeight(1.375);
    const { x, y, z } = panel.mesh.position;
    expect(x).toBe(0);
    expect(y).toBeLessThan(-1.375 / 2); // fora da carta
    expect(Math.abs(z)).toBeLessThan(0.01); // coplanar
    // O topo do painel não invade a carta.
    expect(y + 0.75 / 2).toBeLessThan(-1.375 / 2);
    panel.dispose();
  });

  it('acompanha a altura da carta', () => {
    const panel = new StatsPanel('Pikachu');
    panel.setCardHeight(1.4);
    const a = panel.mesh.position.y;
    panel.setCardHeight(2);
    expect(panel.mesh.position.y).toBeLessThan(a);
    panel.setCardHeight(-1);
    panel.setCardHeight(Number.NaN);
    expect(panel.mesh.position.y).toBeLessThan(a);
    panel.dispose();
  });

  it('começa carregando e recebe cada parte separadamente', () => {
    const panel = new StatsPanel('Pikachu', 25);
    expect(panel.panelModel.data.profile.state).toBe('loading');
    panel.setPart('card', { state: 'error', message: 'sem rede' });
    expect(panel.panelModel.data.card).toEqual({ state: 'error', message: 'sem rede' });
    expect(panel.panelModel.data.profile.state).toBe('loading');
    panel.dispose();
  });

  it('alterna as páginas sozinho e volta ao início quando a carta reaparece depois de um tempo', () => {
    const panel = new StatsPanel('Pikachu');
    // Quadros de tela seguidos (a carta continua visível).
    const frames = (from: number, to: number) => {
      for (let t = from; t <= to; t += 100) panel.update(t, true);
    };
    frames(1000, 1500);
    expect(panel.currentPage).toBe('status');
    frames(1600, 1000 + PAGE_INTERVAL_MS + 200);
    expect(panel.currentPage).toBe('attacks');
    // Carta some por mais que o limite: ao voltar, recomeça pela primeira página.
    panel.update(1000 + PAGE_INTERVAL_MS + 200 + REAPPEAR_AFTER_MS + 500, true);
    expect(panel.currentPage).toBe('status');
    panel.dispose();
  });

  it('página escolhida fica fixa; "auto" volta a alternar', () => {
    const panel = new StatsPanel('Pikachu');
    panel.update(0, true);
    panel.setMode('moves');
    panel.update(10, true);
    expect(panel.currentPage).toBe('moves');
    panel.update(10 + PAGE_INTERVAL_MS * 4, true);
    expect(panel.currentPage).toBe('moves');
    expect(panel.currentMode).toBe('moves');
    panel.dispose();
  });

  it('desligado ou com a carta invisível, não desenha', () => {
    const panel = new StatsPanel('Pikachu');
    const before = panel.draws;
    panel.update(100, false);
    panel.setEnabled(false);
    panel.update(200, true);
    expect(panel.object.visible).toBe(false);
    expect(panel.draws).toBe(before);
    panel.setEnabled(true);
    expect(panel.object.visible).toBe(true);
    panel.dispose();
  });
});

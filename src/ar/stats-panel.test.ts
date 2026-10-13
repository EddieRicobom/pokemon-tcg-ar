import { describe, expect, it } from 'vitest';
import { StatsPanel } from './stats-panel';
import { PAGE_INTERVAL_MS, REAPPEAR_AFTER_MS } from './panel-state';

describe('StatsPanel (painel no chão)', () => {
  it('setPlacement coloca o painel no plano da carta, girado e na largura pedida', () => {
    const panel = new StatsPanel('Pikachu', 25);
    panel.setPlacement({ x: 0.1, y: -0.4, yawRad: Math.PI / 2, width: 0.8, height: 0.6 });
    expect(panel.object.position.x).toBeCloseTo(0.1, 6);
    expect(panel.object.position.y).toBeCloseTo(-0.4, 6);
    expect(Math.abs(panel.object.position.z)).toBeLessThan(0.01); // coplanar com a carta
    expect(panel.object.rotation.z).toBeCloseTo(Math.PI / 2, 6);
    expect(panel.mesh.scale.x).toBeCloseTo(0.8, 6);
    panel.dispose();
  });

  it('ignora posição inválida (NaN, largura zero) sem quebrar', () => {
    const panel = new StatsPanel('Pikachu');
    panel.setPlacement({ x: 0.2, y: 0.2, yawRad: 0, width: 0.5, height: 0.4 });
    panel.setPlacement({ x: Number.NaN, y: 0, yawRad: 0, width: 0.5, height: 0.4 });
    panel.setPlacement({ x: 0, y: 0, yawRad: 0, width: 0, height: 0 });
    expect(panel.object.position.x).toBeCloseTo(0.2, 6);
    expect(panel.mesh.scale.x).toBeCloseTo(0.5, 6);
    panel.dispose();
  });

  it('toque no painel: acerta golpes, pontos de página e descarta fora da textura', () => {
    const panel = new StatsPanel('Pikachu', 25);
    panel.setPart('moves', { state: 'ok', value: [{ name: 'Thunderbolt', type: 'electric', power: 90, accuracy: 100, pp: 15, damageClass: 'special' }] });
    panel.setMode('moves');
    panel.update(0, true);
    // Linha 0 de golpes: y de 120 a 176 (de cima para baixo no canvas); v cresce para cima.
    expect(panel.hit(0.5, 1 - 140 / 384)).toEqual({ kind: 'move', source: 'game', index: 0, name: 'Thunderbolt' });
    expect(panel.hit(0.5, 0.5)).toBeNull(); // espaço vazio
    expect(panel.hit(2, 0.5)).toBeNull();
    expect(panel.hit(Number.NaN, 0.5)).toBeNull();
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

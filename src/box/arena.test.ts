import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ARENA_MAX_DISTANCE, ARENA_MIN_DISTANCE, ARENA_SCALE_RANGE, arenaFrame, arenaRadii, ArenaStage } from './arena';

const dir = (yawDeg: number, pitchDeg: number) => {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return new Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
};

describe('arenaRadii', () => {
  it('cresce com o número de lutadores e é mais larga que funda', () => {
    expect(arenaRadii(6).rx).toBeGreaterThan(arenaRadii(2).rx);
    for (const n of [2, 3, 4, 5, 6]) expect(arenaRadii(n).rz).toBeLessThan(arenaRadii(n).rx);
    expect(arenaRadii(1).rx).toBe(arenaRadii(2).rx);
    expect(arenaRadii(30).rx).toBe(arenaRadii(6).rx);
  });
});

describe('arenaFrame', () => {
  it('cai no chão onde o olhar encontra, limitado a uma distância confortável', () => {
    // Celular a 1,3 m, apontando 45° para baixo: o chão está a 1,3 m na horizontal.
    const f = arenaFrame(dir(0, -45), -1.3, 63, 0.5, 0.7);
    expect(f.distance).toBeCloseTo(1.3, 1);
    expect(f.center.y).toBe(-1.3);
    expect(f.center.x).toBeCloseTo(0, 5);
    expect(f.center.z).toBeCloseTo(-1.3, 1);
    // Olhando quase na horizontal o chão fica longe: limita.
    expect(arenaFrame(dir(0, -10), -1.3, 63, 0.5, 0.7).distance).toBe(ARENA_MAX_DISTANCE);
    // Olhando muito para baixo fica perto demais: limita.
    expect(arenaFrame(dir(0, -80), -1.3, 63, 0.5, 0.7).distance).toBe(ARENA_MIN_DISTANCE);
  });

  it('acompanha a direção do olhar e gira a arena para a tela', () => {
    const f = arenaFrame(dir(90, -45), -1.3, 63, 0.5, 0.7);
    expect(Math.abs(f.center.x)).toBeGreaterThan(1);
    expect(f.center.x).toBeLessThan(0); // neste referencial, yaw positivo olha para -x
    expect(Math.abs(f.center.z)).toBeLessThan(0.01);
    // O eixo z local aponta para o celular: -centro/|centro|.
    const z = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), f.yaw);
    expect(z.x).toBeCloseTo(1, 3);
    const x = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), f.yaw);
    expect(x.z).toBeCloseTo(-1, 3); // "direita da tela" quando se olha para +x é -z
  });

  it('celular apontando para cima ou direto para baixo usa a direção de reserva', () => {
    const up = arenaFrame(new Vector3(0, 1, 0), -1.3, 63, 0.5, 0.7, { x: 0, z: 2 });
    expect(up.center.z).toBeGreaterThan(0.5);
    const down = arenaFrame(new Vector3(0, -1, 0), -1.3, 63, 0.5, 0.7, { x: 3, z: 0 });
    expect(down.center.x).toBeGreaterThan(0.5);
  });

  it('a escala faz a arena caber na largura da tela', () => {
    const narrow = arenaFrame(dir(0, -45), -1.3, 63, 0.5, 0.7);
    const wide = arenaFrame(dir(0, -45), -1.3, 63, 1.8, 0.7);
    expect(narrow.scale).toBeGreaterThanOrEqual(ARENA_SCALE_RANGE.min);
    expect(narrow.scale).toBeLessThan(1);
    expect(wide.scale).toBeGreaterThan(narrow.scale);
    expect(arenaFrame(dir(0, -45), -1.3, 63, 0.5, 1.2).scale).toBeLessThan(narrow.scale);
    // Meia-largura da arena em metros ≈ 70 % da meia-largura visível.
    const slant = Math.hypot(narrow.distance, 1.3);
    const visibleHalf = slant * Math.tan((63 * Math.PI) / 360) * 0.5;
    expect(0.7 * narrow.scale).toBeCloseTo(0.7 * visibleHalf, 2);
  });
});

describe('ArenaStage', () => {
  it('nasce aos poucos, brilha mais com o golpe e libera tudo', () => {
    const stage = new ArenaStage(0.6, 0.3);
    expect(stage.scaleNow).toBeLessThan(0.1);
    for (let i = 0; i < 10; i++) stage.update(100);
    expect(stage.scaleNow).toBeCloseTo(1, 2);
    stage.setColor(0xff0000);
    expect(stage.currentColor).toBe(0xff0000);
    stage.setGlow(5);
    stage.update(16);
    stage.dispose();
  });
});

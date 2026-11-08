import { describe, expect, it } from 'vitest';
import { CINEMA_BEATS, CINEMA_MAX_SLOW_MS, CINEMA_MIN_TIME_SCALE, CINEMA_SLOW_GUARD_MS, cinemaFrame, cinemaTimeScale, createCinemaCamera, resetCinema, showCinemaBanner, stepCinema, triggerCinema } from './survivor-cinema';

describe('câmera de cinema da Torre', () => {
  it('nenhum momento desacelera além do teto nem tira o toque por muito tempo', () => {
    for (const beat of Object.values(CINEMA_BEATS)) {
      const cam = createCinemaCamera();
      triggerCinema(cam, beat);
      expect(cam.slowMs).toBeLessThanOrEqual(CINEMA_MAX_SLOW_MS);
      expect(cinemaTimeScale(cam)).toBeGreaterThanOrEqual(CINEMA_MIN_TIME_SCALE);
    }
  });

  it('volta ao ritmo normal e não deixa resto na tela', () => {
    const cam = createCinemaCamera();
    triggerCinema(cam, CINEMA_BEATS.supremeRelease);
    expect(cinemaFrame(cam, 100).flash).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) stepCinema(cam, 16);
    expect(cinemaTimeScale(cam)).toBe(1);
    expect(cinemaFrame(cam, 200)).toMatchObject({ zoom: 0, shakeX: 0, shakeY: 0, flash: 0, lines: 0 });
  });

  it('chefes caindo em fila não emendam câmera lenta', () => {
    const cam = createCinemaCamera();
    triggerCinema(cam, CINEMA_BEATS.bossDown);
    for (let i = 0; i < 40; i++) stepCinema(cam, 16);
    expect(cinemaTimeScale(cam)).toBe(1);
    triggerCinema(cam, CINEMA_BEATS.bossDown);
    expect(cinemaTimeScale(cam)).toBe(1);
    for (let i = 0; i <= CINEMA_SLOW_GUARD_MS / 16 + 1; i++) stepCinema(cam, 16);
    triggerCinema(cam, CINEMA_BEATS.bossDown);
    expect(cinemaTimeScale(cam)).toBeLessThan(1);
  });

  it('a soltura do Supremo continua a carga sem esperar a trava', () => {
    const cam = createCinemaCamera();
    triggerCinema(cam, CINEMA_BEATS.supremeCharge);
    stepCinema(cam, 100);
    triggerCinema(cam, CINEMA_BEATS.supremeRelease);
    expect(cinemaTimeScale(cam)).toBeLessThan(1);
  });

  it('o letreiro some sozinho e o reinício limpa tudo', () => {
    const cam = createCinemaCamera();
    showCinemaBanner(cam, { kicker: 'A', title: 'B', color: '#fff', portrait: false }, 300);
    stepCinema(cam, 200);
    expect(cam.banner).not.toBeNull();
    stepCinema(cam, 200);
    expect(cam.banner).toBeNull();
    triggerCinema(cam, CINEMA_BEATS.defeat);
    showCinemaBanner(cam, { kicker: 'A', title: 'B', color: '#fff', portrait: false }, 300);
    resetCinema(cam);
    expect(cam.banner).toBeNull();
    expect(cinemaFrame(cam, 0).flash).toBe(0);
  });
});

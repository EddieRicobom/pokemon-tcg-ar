import { describe, expect, it } from 'vitest';
import { activatePinballAbility, createPinballState, launchPinball, mergePinballDex, nudgePinball, pinballPartnerSkill, pinballReward, pinballStage, PINBALL_BOSS_CORE, PINBALL_BUMPERS, PINBALL_DEX_MAX, PINBALL_TARGETS, stepPinball } from './pinball';
import type { PinballState } from './pinball';

function hitTarget(s: PinballState, index = 1): void {
  const target = PINBALL_TARGETS[index]!;
  s.ball = { x: target.x, y: target.y, vx: 0, vy: 0 };
  s.hitCooldown.fill(0);
  stepPinball(s, { left: false, right: false }, 16);
}
function hitCore(s: PinballState): void {
  s.ball = { x: PINBALL_BOSS_CORE.x, y: PINBALL_BOSS_CORE.y, vx: 0, vy: 0 };
  s.bossCooldownMs = 0;
  stepPinball(s, { left: false, right: false }, 16);
}
function hitBumper(s: PinballState): void {
  const bumper = PINBALL_BUMPERS[1]!;
  s.ball = { x: bumper.x, y: bumper.y, vx: 0, vy: 0 };
  s.hitCooldown.fill(0);
  stepPinball(s, { left: false, right: false }, 16);
}

describe('pinball da Vila', () => {
  it('lança, usa física estável e guarda o recorde', () => {
    const s = createPinballState(500);
    expect(s.phase).toBe('ready');
    expect(s.balls).toBe(3);
    expect(launchPinball(s)).toBe(true);
    expect(launchPinball(s)).toBe(false);
    for (let i = 0; i < 200; i++) {
      stepPinball(s, { left: i % 2 === 0, right: i % 3 === 0 }, 16);
      expect(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y)).toBe(true);
      expect(Number.isFinite(s.spin)).toBe(true);
      if (s.phase === 'between') launchPinball(s);
    }
    expect(s.best).toBeGreaterThanOrEqual(500);
  });

  it('flipper esquerdo rebate a bola para cima', () => {
    const s = createPinballState();
    launchPinball(s);
    s.ball = { x: 150, y: 524, vx: 0, vy: 40 };
    const events = stepPinball(s, { left: true, right: false }, 16);
    expect(events).toContain('flipper');
    expect(s.ball.vy).toBeLessThan(0);
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('alvos iniciam captura, evolução e dão progresso e pontuação', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('capture');
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.caught).toBe(1);
    expect(s.mode).toBe('normal');
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('evolution');
    for (let i = 0; i < 7; i++) hitBumper(s);
    expect(s.evolved).toBe(1);
    expect(s.ballLevel).toBe(2);
    expect(s.score).toBeGreaterThan(10000);
    expect(s.best).toBe(s.score);
  });

  it('bola salva não gasta tentativa, mas três perdas terminam a partida', () => {
    const s = createPinballState();
    launchPinball(s);
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.balls).toBe(3);
    expect(s.phase).toBe('playing');
    s.saverMs = 0;
    for (let i = 0; i < 3; i++) {
      s.saverMs = 0;
      s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
      stepPinball(s, { left: false, right: false }, 16);
      if (s.phase === 'between') launchPinball(s);
    }
    expect(s.balls).toBe(0);
    expect(s.phase).toBe('over');
    expect(launchPinball(s)).toBe(false);
  });

  it('sacudir ajuda, mas três sacudidas travam os flippers temporariamente', () => {
    const s = createPinballState();
    expect(nudgePinball(s, 1)).toEqual([]);
    launchPinball(s);
    const vx = s.ball.vx;
    nudgePinball(s, 1);
    expect(s.ball.vx).toBe(vx + 125);
    nudgePinball(s, -1);
    expect(nudgePinball(s, 1)).toContain('tilt');
    expect(s.tiltLockMs).toBe(2200);
    stepPinball(s, { left: true, right: true }, 16);
    expect(s.tiltLockMs).toBeLessThan(2200);
  });

  it('a aventura continua depois da sexta etapa, sem vitória final', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 6; i++) hitTarget(s);
    expect(s.stage).toBe(1);
    expect(s.caught).toBe(1);
    for (let i = 0; i < 3; i++) hitTarget(s);
    for (let i = 0; i < 7; i++) hitBumper(s);
    expect(s.stage).toBe(2);
    expect(s.evolved).toBe(1);
    expect(s.ballLevel).toBe(2);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('bonus');
    for (let i = 0; i < 5; i++) hitBumper(s);
    expect(s.bossPhase).toBe(1);
    hitTarget(s, 0);
    hitTarget(s, 0);
    expect(s.progress).toBe(1);
    hitTarget(s, 1);
    expect(s.bossPhase).toBe(2);
    hitCore(s);
    hitCore(s);
    expect(s.stage).toBe(3);
    expect(s.phase).toBe('playing');
    for (let i = 0; i < 6; i++) hitTarget(s);
    expect(s.stage).toBe(4);
    expect(s.caught).toBe(2);
    expect(s.ballLevel).toBe(3);
    for (let i = 0; i < 3; i++) hitTarget(s);
    for (let i = 0; i < 7; i++) hitBumper(s);
    expect(s.stage).toBe(5);
    expect(s.evolved).toBe(2);
    for (let i = 0; i < 3; i++) hitTarget(s);
    for (let i = 0; i < 5; i++) hitBumper(s);
    hitTarget(s, 0);
    hitTarget(s, 0);
    hitTarget(s, 1);
    hitCore(s);
    hitCore(s);
    expect(s.phase).toBe('playing');
    expect(s.stage).toBe(6);
    expect(s.multiplier).toBe(3);
    expect(launchPinball(s)).toBe(false);
  });

  it('tempo esgotado permite tentar novamente a etapa atual', () => {
    const s = createPinballState();
    launchPinball(s);
    s.stage = 1;
    s.mode = 'capture';
    s.modeMs = 1;
    s.progress = 2;
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.mode).toBe('normal');
    expect(s.stage).toBe(1);
    expect(s.balls).toBe(3);
  });

  it('o tipo real define a habilidade e ausência de dado não cria tipo', () => {
    expect(pinballPartnerSkill(25)).toMatchObject({ type: 'electric', ability: 'impulse', label: 'Impulso' });
    expect(pinballPartnerSkill(7)).toMatchObject({ type: 'water', ability: 'guard' });
    expect(pinballPartnerSkill(445)).toMatchObject({ type: 'dragon', ability: 'power' });
    expect(pinballPartnerSkill(133)).toMatchObject({ type: 'normal', ability: 'focus' });
    expect(pinballPartnerSkill(-1)).toBeNull();
  });

  it('habilidade usa uma carga por bola e a proteção não gasta bola salva', () => {
    const s = createPinballState();
    expect(activatePinballAbility(s, 'guard')).toBe(false);
    launchPinball(s);
    expect(activatePinballAbility(s, 'guard')).toBe(true);
    expect(s.kickback).toBe(true);
    expect(s.saverMs).toBeGreaterThanOrEqual(7000);
    expect(activatePinballAbility(s, 'guard')).toBe(false);
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('playing');
    expect(s.abilityUses).toBe(0);
    s.saverMs = 0;
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('between');
    launchPinball(s);
    expect(s.abilityUses).toBe(1);
  });

  it('precisão acelera captura, mas não pula os alvos distintos do chefe', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(activatePinballAbility(s, 'focus')).toBe(true);
    hitTarget(s);
    expect(s.progress).toBe(2);
    hitTarget(s);
    expect(s.caught).toBe(1);
    s.stage = 2; s.mode = 'bonus'; s.modeMs = 100_000; s.bossPhase = 1; s.bossMask = 0; s.progress = 0;
    hitTarget(s, 0);
    hitTarget(s, 0);
    expect(s.progress).toBe(1);
  });

  it('impulso direciona a bola; impacto dobra os pontos dos bumpers', () => {
    const baseline = createPinballState();
    const powered = createPinballState();
    launchPinball(baseline); launchPinball(powered);
    powered.ball = { x: 270, y: 410, vx: 80, vy: 240 };
    expect(activatePinballAbility(powered, 'impulse')).toBe(true);
    expect(powered.ball.vy).toBe(-880);
    expect(powered.ball.vx).toBeLessThan(0);
    expect(activatePinballAbility(powered, 'power')).toBe(false);
    powered.abilityUses = 1;
    expect(activatePinballAbility(powered, 'power')).toBe(true);
    hitBumper(baseline); hitBumper(powered);
    expect(powered.score).toBe(baseline.score * 2);
    stepPinball(powered, { left: false, right: false }, 50);
    expect(powered.abilityMs).toBeLessThan(12_000);
  });

  it('deixa a bola cair pelo vão central com os dois flippers pressionados', () => {
    const s = createPinballState();
    launchPinball(s);
    s.saverMs = 0;
    s.ball = { x: 180, y: 475, vx: 0, vy: 100 };
    let flipperHits = 0;
    for (let i = 0; i < 90 && s.phase === 'playing'; i++) {
      flipperHits += stepPinball(s, { left: true, right: true }, 16).filter(event => event === 'flipper').length;
    }
    expect(flipperHits).toBe(0);
    expect(s.phase).toBe('between');
    expect(s.balls).toBe(2);
  });

  it('lançamento alcança a mesa, faz pontos e não fica preso na canaleta', () => {
    const s = createPinballState();
    launchPinball(s);
    let highest = s.ball.y;
    for (let i = 0; i < 220; i++) {
      stepPinball(s, { left: false, right: false }, 16);
      highest = Math.min(highest, s.ball.y);
    }
    expect(highest).toBeLessThan(150);
    expect(s.score).toBeGreaterThan(0);
    expect(s.laneHits).toBeGreaterThan(0);
  });

  it('mantém o progresso da missão depois de perder uma bola', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 4; i++) hitTarget(s);
    expect(s.mode).toBe('capture');
    expect(s.progress).toBe(1);
    s.saverMs = 0;
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('between');
    expect(s.mode).toBe('capture');
    expect(s.progress).toBe(1);
    launchPinball(s);
    for (let i = 0; i < 2; i++) hitTarget(s);
    expect(s.caught).toBe(1);
  });

  it('partida guiada atravessa os seis encontros e segue na aventura infinita', () => {
    const s = createPinballState();
    launchPinball(s);
    // Campanha longa na bancada: bolas de sobra para a partida guiada chegar ao sétimo encontro.
    s.balls = 99;
    let frames = 0;
    while (s.stage < 6 && s.phase !== 'over' && frames < 15000) {
      const press = s.ball.y > 500 && s.ball.vy > 0;
      stepPinball(s, { left: press && s.ball.x < 180, right: press && s.ball.x >= 180 }, 16);
      if (s.phase === 'between') launchPinball(s);
      expect(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y)).toBe(true);
      frames++;
    }
    expect(s.phase).toBe('playing');
    expect(s.stage).toBeGreaterThanOrEqual(6);
    expect(frames).toBeGreaterThan(1000);
    expect(s.caught).toBeGreaterThanOrEqual(1);
    expect(s.evolved).toBeGreaterThanOrEqual(1);
    expect(s.score).toBeGreaterThan(10000);
  });

  it('mostra o Pokémon do encontro passeando e troca quando a etapa muda', () => {
    const s = createPinballState();
    launchPinball(s);
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.critters).toHaveLength(2);
    expect(s.critters[0]).toMatchObject({ dexId: 133, name: 'Eevee' });
    const before = s.critters[0]!.x;
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.critters[0]!.x).toBeGreaterThan(before);
    s.stage = 1;
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.critters[0]).toMatchObject({ dexId: 447, name: 'Riolu' });
  });

  it('captura o Pokémon do encontro no desafio e avança a missão', () => {
    const s = createPinballState();
    launchPinball(s);
    stepPinball(s, { left: false, right: false }, 16);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('capture');
    const critter = s.critters[0]!;
    for (let i = 0; i < 3; i++) {
      critter.x = 180; critter.vx = 0;
      critter.hiddenMs = 0; critter.cooldownMs = 0;
      s.ball = { x: critter.x, y: critter.y - critter.r - 4, vx: 0, vy: 260 };
      stepPinball(s, { left: false, right: false }, 16);
      if (i < 2) expect(s.progress).toBe(i + 1);
    }
    expect(s.caught).toBe(1);
    expect(s.mode).toBe('normal');
    expect(s.stage).toBe(1);
    expect(s.captured).toHaveLength(3);
    expect(s.captured[0]).toMatchObject({ dexId: 133, name: 'Eevee', stage: 0 });
  });

  it('registra a espécie quando a captura termina pelos alvos', () => {
    const s = createPinballState();
    launchPinball(s);
    stepPinball(s, { left: false, right: false }, 16);
    for (let i = 0; i < 3; i++) hitTarget(s);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.caught).toBe(1);
    expect(s.captured).toEqual([{ dexId: 133, name: 'Eevee', stage: 0 }]);
  });

  it('a bola quica no Pokémon que passeia pela mesa', () => {
    const s = createPinballState();
    launchPinball(s);
    stepPinball(s, { left: false, right: false }, 16);
    const critter = s.critters[0]!;
    critter.x = 180; critter.vx = 0;
    s.ball = { x: critter.x, y: critter.y - critter.r - 7.5, vx: 0, vy: 300 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.ball.vy).toBeLessThan(0);
    expect(critter.flashMs).toBeGreaterThan(0);
    expect(critter.hiddenMs).toBeGreaterThan(0);
  });

  it('depois da sexta etapa percorre a Pokédex inteira sem repetir espécie', () => {
    const ids = new Set<number>();
    for (let i = 0; i < PINBALL_DEX_MAX; i++) ids.add(pinballStage(6 + i).dexId);
    expect(ids.size).toBe(PINBALL_DEX_MAX);
    expect(pinballStage(6)).toMatchObject({ mode: 'capture', dexId: 1, species: 'Bulbasaur' });
    expect(pinballStage(7).mode).toBe('evolution');
    expect(pinballStage(8).mode).toBe('bonus');
    expect(pinballStage(6).title).toContain('2');
  });

  it('concluir a captura dá bola extra e a Pokédex do Pinball não duplica', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 6; i++) hitTarget(s);
    expect(s.caught).toBe(1);
    expect(s.balls).toBe(4);
    expect(mergePinballDex([133, 447], [{ dexId: 133 }, { dexId: 25 }])).toEqual([25, 133, 447]);
    expect(mergePinballDex([0, 1026], [])).toEqual([]);

    const capped = createPinballState();
    launchPinball(capped);
    capped.balls = 9; capped.mode = 'capture'; capped.modeMs = 60_000; capped.progress = 2;
    hitTarget(capped);
    expect(capped.caught).toBe(1);
    expect(capped.balls).toBe(9);
    expect(capped.score).toBeGreaterThan(10_000);
  });

  it('bumper iluminado e sequência C-A-T concedem bônus', () => {
    const lit = createPinballState();
    launchPinball(lit);
    lit.bonusSpot = 3;
    const bumper = PINBALL_BUMPERS[3]!;
    lit.ball = { x: bumper.x, y: bumper.y, vx: 0, vy: 0 };
    lit.hitCooldown.fill(0);
    stepPinball(lit, { left: false, right: false }, 16);
    expect(lit.bonusAwards).toBe(1);
    expect(lit.bonusKind).toBe('fire');
    expect(lit.bonusMs).toBeGreaterThan(0);

    const letters = createPinballState();
    launchPinball(letters);
    hitTarget(letters, 0);
    hitTarget(letters, 1);
    hitTarget(letters, 2);
    expect(letters.bonusAwards).toBe(1);
    expect(letters.bonusKind).toBe('fire');
  });

  it('a bola não fica presa na entrada direita da mesa', () => {
    const s = createPinballState();
    launchPinball(s);
    s.saverMs = 0;
    s.ball = { x: 293, y: 451, vx: 0, vy: 0 };
    for (let i = 0; i < 400 && s.phase === 'playing'; i++) stepPinball(s, { left: false, right: false }, 16);
    expect(Math.hypot(s.ball.x - 293, s.ball.y - 451) > 24 || s.phase !== 'playing').toBe(true);
  });

  it('paga mais na vitória e soma capturas/evoluções, com teto', () => {
    const base = createPinballState(0);
    expect(pinballReward({ ...base, phase: 'ready' })).toBe(0);
    const loss = pinballReward({ ...base, phase: 'over', score: 2400, caught: 2, evolved: 1 });
    expect(loss).toBe(3);
    const win = pinballReward({ ...base, phase: 'won', score: 6000, caught: 2, evolved: 1 });
    expect(win).toBe(25 + 15 + 4 + 3);
    const late = pinballReward({ ...base, phase: 'won', stage: 5, score: 10_000, caught: 2, evolved: 2 });
    expect(late).toBe(25 + 40 + 25 + 4 + 6);
    expect(pinballReward({ ...base, phase: 'won', stage: 5, score: 10_000_000, caught: 99, evolved: 99 })).toBe(120);
  });
});

/**
 * Fenda do Mew: hack-n-slash top-down onde o treinador (não um Pokémon) explora um mapa grande que
 * continua a Vila. Armas vêm do catálogo da Masmorra, adaptadas para tempo real. A simulação é pura
 * e determinística (RNG por seed), para os testes e para o save.
 */

export const RIFT_TILE = 32;
export const RIFT_W = 120;
export const RIFT_H = 90;
/** Centro da clareira segura (a Vila fica “atrás” dela). */
export const RIFT_SANCTUARY = { x: 60, y: 74 } as const;
export const RIFT_MAX_ALLIES = 3;
export const RIFT_SAVE_KEY = 'tcg-ar-rift-v1';

export type RiftTile = 0 | 1 | 2 | 3 | 4 | 5;
export type RiftZone = 'Vila' | 'Campos' | 'Bosque' | 'Ruínas' | 'Brasa';

export interface RiftWeapon {
  id: string;
  name: string;
  kind: 'melee' | 'ranged';
  damage: number;
  cooldownMs: number;
  range: number;
  /** Melee: abertura do golpe em radianos (2π = em volta). Ranged: velocidade do projétil (px/s). */
  arc: number;
  color: string;
  /** Texto curto para o menu. */
  note: string;
}

export const RIFT_WEAPONS: Readonly<Record<string, RiftWeapon>> = {
  espada: { id: 'espada', name: 'Espada longa', kind: 'melee', damage: 16, cooldownMs: 520, range: 76, arc: 1.15, color: '#d8e6ff', note: 'Corte preciso à frente.' },
  laminas: { id: 'laminas', name: 'Lâminas duplas', kind: 'melee', damage: 9, cooldownMs: 300, range: 62, arc: 1.5, color: '#9ff5d0', note: 'Dois cortes rápidos.' },
  lanca: { id: 'lanca', name: 'Lança de combate', kind: 'melee', damage: 14, cooldownMs: 600, range: 108, arc: 0.42, color: '#ffd27a', note: 'Estocada longa e estreita.' },
  martelo: { id: 'martelo', name: 'Martelo de impacto', kind: 'melee', damage: 27, cooldownMs: 950, range: 86, arc: Math.PI * 2, color: '#ff9f6e', note: 'Gira em volta; lento e pesado.' },
  emissor: { id: 'emissor', name: 'Emissor rápido', kind: 'ranged', damage: 10, cooldownMs: 430, range: 250, arc: 560, color: '#8fd4ff', note: 'Projétil rápido.' },
  rifle: { id: 'rifle', name: 'Rifle perfurante', kind: 'ranged', damage: 18, cooldownMs: 680, range: 380, arc: 900, color: '#ffe066', note: 'Tiro longo e forte.' },
  canhao: { id: 'canhao', name: 'Canhão de carga', kind: 'ranged', damage: 26, cooldownMs: 980, range: 320, arc: 430, color: '#ff8f6e', note: 'Disparo pesado.' },
};
export const RIFT_START_WEAPONS = ['espada', 'laminas', 'emissor'] as const;

export interface RiftPlayer {
  x: number;
  y: number;
  facing: number;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  maxHp: number;
  weapon: string;
  potions: number;
  balls: number;
  attackMs: number;
  dodgeMs: number;
  dodgeCdMs: number;
  invulnMs: number;
  unlocked: string[];
}

export interface RiftAlly {
  id: string;
  dexId: number;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  attackMs: number;
}

export interface RiftEnemy {
  id: string;
  dexId: number;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  radius: number;
  attackMs: number;
  boss: boolean;
  elite: boolean;
  /** Identificador do chefe derrotado (só nos chefes). */
  bossId?: 'ruinas' | 'brasa';
}

export interface RiftProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  ttlMs: number;
  color: string;
}

export interface RiftLoot {
  id: string;
  x: number;
  y: number;
  kind: 'potion' | 'ball' | 'weapon';
  weapon?: string;
}

export type RiftEvent =
  | { kind: 'hit'; x: number; y: number; damage: number; crit: boolean }
  | { kind: 'shot'; x: number; y: number; angle: number; color: string }
  | { kind: 'swing'; x: number; y: number; angle: number; range: number; arc: number; color: string }
  | { kind: 'hurt'; damage: number }
  | { kind: 'down'; x: number; y: number; xp: number }
  | { kind: 'level'; level: number }
  | { kind: 'captured'; name: string }
  | { kind: 'loot'; x: number; y: number; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'dead' };

export interface RiftState {
  seed: number;
  player: RiftPlayer;
  allies: RiftAlly[];
  enemies: RiftEnemy[];
  projectiles: RiftProjectile[];
  loot: RiftLoot[];
  defeated: string[];
  timeMs: number;
  dead: boolean;
  nextId: number;
}

export interface RiftInput {
  moveX: number;
  moveY: number;
  attack: boolean;
  dodge: boolean;
}

// --------------------------------------------------------------------------------------------- mundo

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface RiftWorld {
  seed: number;
  tiles: Uint8Array;
}

export function createRiftWorld(seed = 20261123): RiftWorld {
  const tiles = new Uint8Array(RIFT_W * RIFT_H);
  const set = (x: number, y: number, tile: RiftTile): void => {
    if (x >= 0 && y >= 0 && x < RIFT_W && y < RIFT_H) tiles[y * RIFT_W + x] = tile;
  };
  const get = (x: number, y: number): RiftTile => (x >= 0 && y >= 0 && x < RIFT_W && y < RIFT_H ? tiles[y * RIFT_W + x] as RiftTile : 3);
  // Estradas saindo da clareira: uma reta para o norte e uma curva para o oeste.
  for (let y = 34; y <= 78; y++) for (let x = 58; x <= 62; x++) set(x, y, 1);
  for (let x = 26; x <= 60; x++) for (let y = 58; y <= 62; y++) set(x, y, 1);
  for (let x = 60; x <= 96; x++) for (let y = 70; y <= 74; y++) set(x, y, 1);
  // Clareira segura da Vila.
  for (let y = 66; y <= 80; y++) for (let x = 52; x <= 68; x++) set(x, y, 1);
  // Lagos.
  const lake = (cx: number, cy: number, rx: number, ry: number): void => {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 0.86 + hash(x, y, seed) * 0.22) set(x, y, 2);
    }
  };
  lake(22, 52, 14, 10);
  lake(96, 76, 10, 7);
  lake(30, 18, 9, 7);
  // Ruínas ao norte e brasa a leste.
  for (let y = 6; y <= 26; y++) for (let x = 12; x <= 38; x++) {
    const edge = x === 12 || x === 38 || y === 6 || y === 26;
    set(x, y, edge && hash(x, y, seed + 1) > 0.18 ? 3 : 4);
  }
  for (let y = 8; y <= 30; y++) for (let x = 82; x <= 110; x++) {
    const d = ((x - 96) / 15) ** 2 + ((y - 19) / 12) ** 2;
    if (d < 0.9 + hash(x, y, seed + 2) * 0.15) set(x, y, 5);
  }
  // Plataforma de obsidiana no coração da brasa, onde o chefe espera.
  for (let y = 16; y <= 22; y++) for (let x = 93; x <= 99; x++) set(x, y, 4);
  // Acessos: trilha até a entrada sul das Ruínas e ponte de pedra para a plataforma da Brasa.
  for (let y = 27; y <= 58; y++) for (let x = 24; x <= 25; x++) set(x, y, 1);
  set(24, 26, 1);
  set(25, 26, 1);
  for (let x = 80; x <= 93; x++) set(x, 19, 4);
  // Pedras espalhadas (nunca sobre estrada, água, ruína ou lava).
  for (let y = 1; y < RIFT_H - 1; y++) for (let x = 1; x < RIFT_W - 1; x++) {
    const current = get(x, y);
    if (current !== 0) continue;
    if (hash(x, y, seed + 3) > 0.955) set(x, y, 3);
  }
  return { seed, tiles };
}

export function riftTile(world: RiftWorld, tx: number, ty: number): RiftTile {
  if (tx < 0 || ty < 0 || tx >= RIFT_W || ty >= RIFT_H) return 3;
  return world.tiles[ty * RIFT_W + tx] as RiftTile;
}

export function riftWalkable(world: RiftWorld, x: number, y: number): boolean {
  const tile = riftTile(world, Math.floor(x / RIFT_TILE), Math.floor(y / RIFT_TILE));
  return tile === 0 || tile === 1 || tile === 4;
}

export function riftSanctuary(x: number, y: number): boolean {
  const tx = x / RIFT_TILE;
  const ty = y / RIFT_TILE;
  return (tx - RIFT_SANCTUARY.x) ** 2 + (ty - RIFT_SANCTUARY.y) ** 2 < 7.5 ** 2;
}

export function riftZone(x: number, y: number): RiftZone {
  const tx = x / RIFT_TILE;
  const ty = y / RIFT_TILE;
  if (riftSanctuary(x, y)) return 'Vila';
  if (tx >= 10 && tx <= 40 && ty >= 4 && ty <= 28) return 'Ruínas';
  if (tx >= 78 && ty <= 34) return 'Brasa';
  if (tx < 44) return 'Bosque';
  return 'Campos';
}

/** Move um círculo resolvendo os eixos separadamente (desliza pela parede). */
export function riftMove(world: RiftWorld, point: { x: number; y: number }, dx: number, dy: number, radius = 10): void {
  const nx = point.x + dx;
  if (riftWalkable(world, nx - radius, point.y - radius) && riftWalkable(world, nx + radius, point.y - radius)
    && riftWalkable(world, nx - radius, point.y + radius) && riftWalkable(world, nx + radius, point.y + radius)) point.x = nx;
  const ny = point.y + dy;
  if (riftWalkable(world, point.x - radius, ny - radius) && riftWalkable(world, point.x + radius, ny - radius)
    && riftWalkable(world, point.x - radius, ny + radius) && riftWalkable(world, point.x + radius, ny + radius)) point.y = ny;
}

// --------------------------------------------------------------------------------------------- criaturas

const POOLS: Record<Exclude<RiftZone, 'Vila'>, { dexId: number; name: string }[]> = {
  Campos: [{ dexId: 25, name: 'Pikachu' }, { dexId: 179, name: 'Mareep' }, { dexId: 399, name: 'Bidoof' }, { dexId: 161, name: 'Sentret' }, { dexId: 133, name: 'Eevee' }],
  Bosque: [{ dexId: 10, name: 'Caterpie' }, { dexId: 13, name: 'Weedle' }, { dexId: 43, name: 'Oddish' }, { dexId: 285, name: 'Shroomish' }, { dexId: 265, name: 'Wurmple' }, { dexId: 214, name: 'Heracross' }],
  Ruínas: [{ dexId: 92, name: 'Gastly' }, { dexId: 355, name: 'Duskull' }, { dexId: 302, name: 'Sableye' }, { dexId: 436, name: 'Bronzor' }, { dexId: 562, name: 'Yamask' }],
  Brasa: [{ dexId: 322, name: 'Numel' }, { dexId: 218, name: 'Slugma' }, { dexId: 228, name: 'Houndour' }, { dexId: 667, name: 'Litleo' }, { dexId: 58, name: 'Growlithe' }],
};

export const RIFT_BOSSES = [
  { id: 'ruinas', dexId: 94, name: 'Gengar', level: 12, x: 25 * RIFT_TILE + 16, y: 16 * RIFT_TILE + 16 },
  { id: 'brasa', dexId: 59, name: 'Arcanine', level: 18, x: 96 * RIFT_TILE + 16, y: 19 * RIFT_TILE + 16 },
] as const;

export function riftXpNext(level: number): number {
  return 42 + level * 22;
}

export function createRiftState(seed = 20261123): RiftState {
  return {
    seed,
    player: {
      x: RIFT_SANCTUARY.x * RIFT_TILE + 16,
      y: (RIFT_SANCTUARY.y + 2) * RIFT_TILE + 16,
      facing: -Math.PI / 2,
      level: 1,
      xp: 0,
      xpNext: riftXpNext(1),
      hp: 100,
      maxHp: 100,
      weapon: 'espada',
      potions: 2,
      balls: 5,
      attackMs: 0,
      dodgeMs: 0,
      dodgeCdMs: 0,
      invulnMs: 0,
      unlocked: ['espada', 'laminas', 'emissor'],
    },
    allies: [],
    enemies: [],
    projectiles: [],
    loot: [],
    defeated: [],
    timeMs: 0,
    dead: false,
    nextId: 1,
  };
}

function nextId(state: RiftState): string {
  return `r${state.nextId++}`;
}

function nearestEnemy(state: RiftState, x: number, y: number, maxDistance: number): RiftEnemy | null {
  let best: RiftEnemy | null = null;
  let bestD = maxDistance;
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - x, enemy.y - y);
    if (d < bestD) { best = enemy; bestD = d; }
  }
  return best;
}

export function riftSpawnEnemy(world: RiftWorld, state: RiftState, rng: () => number): RiftEnemy | null {
  if (state.enemies.length >= 28) return null;
  let zone: RiftZone = 'Campos';
  let x = 0;
  let y = 0;
  let found = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = rng() * Math.PI * 2;
    const distance = (10 + rng() * 16) * RIFT_TILE;
    x = state.player.x + Math.cos(angle) * distance;
    y = state.player.y + Math.sin(angle) * distance;
    if (!riftWalkable(world, x, y)) continue;
    if (riftSanctuary(x, y)) continue;
    zone = riftZone(x, y);
    if (zone !== 'Vila') { found = true; break; }
  }
  if (!found) return null;
  const pool = POOLS[zone as Exclude<RiftZone, 'Vila'>];
  const pick = pool[Math.floor(rng() * pool.length) % pool.length]!;
  const level = Math.max(1, Math.round(1 + state.player.level * 0.55 + (Math.hypot(x - RIFT_SANCTUARY.x * RIFT_TILE, y - RIFT_SANCTUARY.y * RIFT_TILE) / RIFT_TILE) / 7));
  const elite = rng() < 0.12;
  const maxHp = 34 + level * 14 + (elite ? 60 : 0);
  return {
    id: nextId(state), dexId: pick.dexId, name: pick.name, level, hp: maxHp, maxHp,
    x, y, radius: elite ? 18 : 14, attackMs: 0, boss: false, elite,
  };
}

/** Dano do treinador com a arma atual. */
export function riftDamage(state: RiftState): number {
  const weapon = RIFT_WEAPONS[state.player.weapon] ?? RIFT_WEAPONS.espada!;
  return Math.round(weapon.damage + state.player.level * 2.4);
}

/** Aponta para o inimigo mais próximo dentro do alcance dobrado (auto-mira leve). */
export function riftFaceNearest(state: RiftState): void {
  const weapon = RIFT_WEAPONS[state.player.weapon] ?? RIFT_WEAPONS.espada!;
  const target = nearestEnemy(state, state.player.x, state.player.y, weapon.range * 1.8);
  if (target) state.player.facing = Math.atan2(target.y - state.player.y, target.x - state.player.x);
}

function hitEnemy(state: RiftState, enemy: RiftEnemy, damage: number, crit: boolean, events: RiftEvent[]): void {
  enemy.hp -= damage;
  events.push({ kind: 'hit', x: enemy.x, y: enemy.y, damage, crit });
  if (enemy.hp > 0) return;
  state.enemies = state.enemies.filter((e) => e !== enemy);
  const xp = Math.round((enemy.boss ? 120 : enemy.elite ? 28 : 12) + enemy.level * 5);
  state.player.xp += xp;
  if (enemy.boss) {
    const bossId = enemy.bossId ?? (enemy.name === 'Gengar' ? 'ruinas' : 'brasa');
    if (!state.defeated.includes(bossId)) state.defeated.push(bossId);
  }
  while (state.player.xp >= state.player.xpNext) {
    state.player.xp -= state.player.xpNext;
    state.player.level++;
    state.player.xpNext = riftXpNext(state.player.level);
    state.player.maxHp += 12;
    state.player.hp = state.player.maxHp;
    events.push({ kind: 'level', level: state.player.level });
  }
  events.push({ kind: 'down', x: enemy.x, y: enemy.y, xp });
  // Itens caem de tempos em tempos; chefes sempre deixam uma arma nova.
  const roll = (enemy.x + enemy.y + state.timeMs) % 1;
  if (enemy.boss) {
    const weapon = Object.keys(RIFT_WEAPONS).find((id) => !state.player.unlocked.includes(id)) ?? 'canhao';
    if (!state.player.unlocked.includes(weapon)) state.player.unlocked.push(weapon);
    state.loot.push({ id: nextId(state), x: enemy.x, y: enemy.y, kind: 'weapon', weapon });
    events.push({ kind: 'loot', x: enemy.x, y: enemy.y, text: 'Arma nova!' });
  } else if (enemy.elite || roll < 0.16) {
    state.loot.push({ id: nextId(state), x: enemy.x, y: enemy.y, kind: roll < 0.08 ? 'ball' : 'potion' });
  }
}

/** Ataque do treinador. Retorna true quando o golpe saiu. */
export function riftAttack(state: RiftState, events: RiftEvent[]): boolean {
  const weapon = RIFT_WEAPONS[state.player.weapon] ?? RIFT_WEAPONS.espada!;
  if (state.player.attackMs > 0 || state.dead) return false;
  state.player.attackMs = weapon.cooldownMs;
  riftFaceNearest(state);
  if (weapon.kind === 'ranged') {
    const angle = state.player.facing;
    state.projectiles.push({
      id: nextId(state), x: state.player.x, y: state.player.y, vx: Math.cos(angle) * weapon.arc, vy: Math.sin(angle) * weapon.arc,
      damage: riftDamage(state), ttlMs: (weapon.range / weapon.arc) * 1000, color: weapon.color,
    });
    events.push({ kind: 'shot', x: state.player.x, y: state.player.y, angle, color: weapon.color });
    return true;
  }
  const maxAngle = weapon.arc >= Math.PI * 2 - 0.01 ? Math.PI : weapon.arc / 2;
  events.push({ kind: 'swing', x: state.player.x, y: state.player.y, angle: state.player.facing, range: weapon.range, arc: weapon.arc, color: weapon.color });
  for (const enemy of [...state.enemies]) {
    const dx = enemy.x - state.player.x;
    const dy = enemy.y - state.player.y;
    if (Math.hypot(dx, dy) > weapon.range + enemy.radius) continue;
    const diff = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - state.player.facing), Math.cos(Math.atan2(dy, dx) - state.player.facing)));
    if (diff > maxAngle + 0.12) continue;
    const crit = (enemy.x * 7 + enemy.y * 13 + state.timeMs) % 100 < 12;
    hitEnemy(state, enemy, Math.round(riftDamage(state) * (crit ? 1.7 : 1)), crit, events);
  }
  return true;
}

export function riftSpawnBoss(state: RiftState, zone: RiftZone): RiftEnemy | null {
  if (zone !== 'Ruínas' && zone !== 'Brasa') return null;
  const id = zone === 'Ruínas' ? 'ruinas' : 'brasa';
  const boss = RIFT_BOSSES.find((b) => b.id === id);
  if (!boss || state.defeated.includes(id) || state.enemies.some((e) => e.boss)) return null;
  return { id: `boss-${boss.id}`, dexId: boss.dexId, name: boss.name, level: boss.level, hp: 180 + boss.level * 30, maxHp: 180 + boss.level * 30, x: boss.x, y: boss.y, radius: 22, attackMs: 0, boss: true, elite: false, bossId: boss.id };
}

export function riftCapture(state: RiftState, rng: () => number, events: RiftEvent[]): boolean {
  if (state.dead) return false;
  if (state.player.balls <= 0) { events.push({ kind: 'message', text: 'Sem Pokébolas. Derrote inimigos para conseguir mais.' }); return false; }
  if (state.allies.length >= RIFT_MAX_ALLIES) { events.push({ kind: 'message', text: `Sua equipe já tem ${RIFT_MAX_ALLIES} Pokémon.` }); return false; }
  const target = nearestEnemy(state, state.player.x, state.player.y, 160);
  if (!target || target.boss) { events.push({ kind: 'message', text: 'Aproxime-se de um Pokémon enfraquecido.' }); return false; }
  if (target.hp / target.maxHp > 0.35) { events.push({ kind: 'message', text: `${target.name} ainda está forte (deixe abaixo de 35%).` }); return false; }
  state.player.balls--;
  const chance = Math.min(0.95, 0.35 + (1 - target.hp / target.maxHp) * 0.6 + (state.player.level - target.level) * 0.03);
  if (rng() > chance) { events.push({ kind: 'message', text: `${target.name} escapou da bola!` }); return false; }
  state.enemies = state.enemies.filter((e) => e !== target);
  state.allies.push({
    id: nextId(state), dexId: target.dexId, name: target.name, level: target.level,
    hp: Math.round(target.maxHp * 0.7), maxHp: target.maxHp,
    x: state.player.x - 26, y: state.player.y + 16, attackMs: 0,
  });
  events.push({ kind: 'captured', name: target.name });
  return true;
}

export function riftUsePotion(state: RiftState, events: RiftEvent[]): boolean {
  if (state.player.potions <= 0 || state.player.hp >= state.player.maxHp) return false;
  state.player.potions--;
  const heal = Math.round(state.player.maxHp * 0.45);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  events.push({ kind: 'message', text: `Poção: +${heal} de vida.` });
  return true;
}

/** Passo do combate/mundo. O componente cuida do desenho, do save e dos botões. */
export function stepRift(world: RiftWorld, state: RiftState, input: RiftInput, dtMs: number, events: RiftEvent[] = []): RiftEvent[] {
  if (state.dead) return events;
  const dt = Math.min(50, Math.max(0, dtMs));
  const seconds = dt / 1000;
  state.timeMs += dt;
  const p = state.player;
  p.attackMs = Math.max(0, p.attackMs - dt);
  p.dodgeCdMs = Math.max(0, p.dodgeCdMs - dt);
  p.invulnMs = Math.max(0, p.invulnMs - dt);
  p.dodgeMs = Math.max(0, p.dodgeMs - dt);
  // A clareira da Vila é segura: ninguém ataca e o treinador recupera vida devagar.
  const safe = riftSanctuary(p.x, p.y);
  if (safe && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 7 * seconds);
  const length = Math.hypot(input.moveX, input.moveY);
  if (length > 0.05) {
    const speed = p.dodgeMs > 0 ? 330 : 138;
    const dx = (input.moveX / length) * speed * seconds;
    const dy = (input.moveY / length) * speed * seconds;
    p.facing = Math.atan2(dy, dx);
    riftMove(world, p, dx, dy, 9);
  }
  if (input.dodge && p.dodgeCdMs <= 0 && length > 0.05) {
    p.dodgeCdMs = 1300;
    p.dodgeMs = 190;
    p.invulnMs = 300;
  }
  if (input.attack) riftAttack(state, events);

  // Projéteis do treinador.
  for (const shot of [...state.projectiles]) {
    shot.x += shot.vx * seconds;
    shot.y += shot.vy * seconds;
    shot.ttlMs -= dt;
    let hit = false;
    for (const enemy of [...state.enemies]) {
      if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) > enemy.radius + 7) continue;
      hitEnemy(state, enemy, shot.damage, false, events);
      hit = true;
      break;
    }
    if (hit || shot.ttlMs <= 0 || !riftWalkable(world, shot.x, shot.y)) state.projectiles = state.projectiles.filter((s) => s !== shot);
  }

  // Inimigos: perseguem o treinador e batem de perto.
  for (const enemy of [...state.enemies]) {
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    enemy.attackMs = Math.max(0, enemy.attackMs - dt);
    if (distance > (enemy.boss ? 520 : 340) || distance < 1) continue;
    const speed = (enemy.boss ? 72 : enemy.elite ? 90 : 66) * seconds;
    if (distance > (enemy.boss ? 34 : 26)) {
      riftMove(world, enemy, (dx / distance) * speed, (dy / distance) * speed, enemy.radius);
    } else if (enemy.attackMs <= 0 && !safe) {
      enemy.attackMs = enemy.boss ? 850 : 1100;
      if (p.invulnMs <= 0) {
        const damage = Math.round((enemy.boss ? 16 : 7) + enemy.level * 1.2);
        p.hp -= damage;
        events.push({ kind: 'hurt', damage });
        p.invulnMs = 420;
        if (p.hp <= 0) {
          p.hp = 0;
          state.dead = true;
          events.push({ kind: 'dead' });
        }
      }
    }
  }

  // Aliados: seguem e atacam sozinhos.
  for (const ally of state.allies) {
    const target = nearestEnemy(state, ally.x, ally.y, 170);
    if (target) {
      ally.attackMs = Math.max(0, ally.attackMs - dt);
      if (ally.attackMs <= 0) {
        ally.attackMs = 900;
        hitEnemy(state, target, Math.round(7 + ally.level * 2.2), false, events);
      }
    }
    const dx = p.x - ally.x;
    const dy = p.y - ally.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 52) riftMove(world, ally, (dx / distance) * 105 * seconds, (dy / distance) * 105 * seconds, 8);
  }

  // Coleta de itens.
  for (const item of [...state.loot]) {
    if (Math.hypot(item.x - p.x, item.y - p.y) > 24) continue;
    if (item.kind === 'potion') { p.potions++; events.push({ kind: 'loot', x: item.x, y: item.y, text: 'Poção' }); }
    else if (item.kind === 'ball') { p.balls++; events.push({ kind: 'loot', x: item.x, y: item.y, text: 'Pokébola' }); }
    else if (item.weapon && !p.unlocked.includes(item.weapon)) {
      p.unlocked.push(item.weapon);
      p.weapon = item.weapon;
      events.push({ kind: 'loot', x: item.x, y: item.y, text: `Arma: ${RIFT_WEAPONS[item.weapon]?.name ?? item.weapon}` });
    }
    state.loot = state.loot.filter((l) => l !== item);
  }
  return events;
}

export function toggleRiftWeapon(state: RiftState, id: string): boolean {
  if (!state.player.unlocked.includes(id) || !RIFT_WEAPONS[id]) return false;
  state.player.weapon = id;
  return true;
}

export function riftRespawn(state: RiftState): void {
  state.dead = false;
  state.player.hp = state.player.maxHp;
  state.player.x = RIFT_SANCTUARY.x * RIFT_TILE + 16;
  state.player.y = (RIFT_SANCTUARY.y + 2) * RIFT_TILE + 16;
  state.player.invulnMs = 1600;
  state.player.attackMs = 0;
  state.projectiles = [];
  // Perde 10% do XP atual, não o nível.
  state.player.xp = Math.max(0, Math.floor(state.player.xp * 0.9));
}

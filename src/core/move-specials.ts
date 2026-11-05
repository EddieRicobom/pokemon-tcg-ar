/**
 * Efeitos dos golpes que a PokéAPI não descreve em números: proteger, carregar, recarregar, dano fixo, nocaute direto,
 * clima, telas e afins. O golpe continua vindo dos dados reais (tipo, poder, precisão, PP); esta tabela diz só como ele
 * se comporta no duelo por turnos, pelo nome oficial em inglês (`slug`). Golpe fora da tabela segue os dados da PokéAPI.
 */

export type WeatherKind = 'sun' | 'rain' | 'sand' | 'hail';
export type ScreenKind = 'reflect' | 'light';

export type MoveSpecial =
  | { kind: 'protect' }
  /** Prepara num turno e acerta no seguinte; `semi` some de campo enquanto isso (Voar, Cavar). */
  | { kind: 'charge'; semi: boolean; sunSkips?: boolean }
  /** Depois de acertar, fica um turno sem agir. */
  | { kind: 'recharge' }
  | { kind: 'fixed'; damage: number }
  | { kind: 'half' }
  | { kind: 'ohko' }
  | { kind: 'self-faint' }
  | { kind: 'weather'; weather: WeatherKind }
  | { kind: 'screen'; screen: ScreenKind }
  | { kind: 'leech' }
  | { kind: 'toxic' }
  | { kind: 'trap' }
  | { kind: 'rest' };

const NIVEL = 50;

const groups: readonly [readonly string[], MoveSpecial][] = [
  [['protect', 'detect'], { kind: 'protect' }],
  [['solar-beam'], { kind: 'charge', semi: false, sunSkips: true }],
  [['razor-wind', 'skull-bash', 'sky-attack'], { kind: 'charge', semi: false }],
  [['fly', 'dig', 'dive', 'bounce'], { kind: 'charge', semi: true }],
  [['hyper-beam', 'giga-impact', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'rock-wrecker', 'roar-of-time'], { kind: 'recharge' }],
  [['dragon-rage'], { kind: 'fixed', damage: 40 }],
  [['sonic-boom'], { kind: 'fixed', damage: 20 }],
  [['seismic-toss', 'night-shade'], { kind: 'fixed', damage: NIVEL }],
  [['super-fang'], { kind: 'half' }],
  [['guillotine', 'horn-drill', 'fissure', 'sheer-cold'], { kind: 'ohko' }],
  [['self-destruct', 'explosion'], { kind: 'self-faint' }],
  [['sunny-day'], { kind: 'weather', weather: 'sun' }],
  [['rain-dance'], { kind: 'weather', weather: 'rain' }],
  [['sandstorm'], { kind: 'weather', weather: 'sand' }],
  [['hail'], { kind: 'weather', weather: 'hail' }],
  [['reflect'], { kind: 'screen', screen: 'reflect' }],
  [['light-screen'], { kind: 'screen', screen: 'light' }],
  [['leech-seed'], { kind: 'leech' }],
  [['toxic'], { kind: 'toxic' }],
  [['wrap', 'bind', 'fire-spin', 'whirlpool', 'clamp', 'sand-tomb', 'magma-storm', 'infestation'], { kind: 'trap' }],
  [['rest'], { kind: 'rest' }],
];

const SPECIALS = new Map<string, MoveSpecial>(groups.flatMap(([slugs, special]) => slugs.map((slug): [string, MoveSpecial] => [slug, special])));

export function moveSpecial(slug: string): MoveSpecial | null {
  return SPECIALS.get(slug) ?? null;
}

/** Golpes sem poder na PokéAPI cujo dano vem da regra do golpe. */
export function hasOwnDamage(special: MoveSpecial | null): boolean {
  return special?.kind === 'fixed' || special?.kind === 'half' || special?.kind === 'ohko';
}

/** O que o efeito faz, para o editor e o menu de golpes. */
export function specialHint(special: MoveSpecial | null): string | null {
  switch (special?.kind) {
    case 'protect': return 'Bloqueia o golpe do turno; repetir falha mais';
    case 'charge': return special.semi ? 'Some num turno e ataca no seguinte' : 'Prepara num turno e ataca no seguinte';
    case 'recharge': return 'Depois de acertar, fica 1 turno parado';
    case 'fixed': return `Dano fixo de ${special.damage}`;
    case 'half': return 'Tira metade dos PS atuais';
    case 'ohko': return 'Nocaute direto se acertar';
    case 'self-faint': return 'Quem usa desmaia';
    case 'weather': return 'Muda o clima por 5 turnos';
    case 'screen': return special.screen === 'reflect' ? 'Metade do dano físico por 5 turnos' : 'Metade do dano especial por 5 turnos';
    case 'leech': return 'Drena PS do alvo todo turno';
    case 'toxic': return 'Veneno que piora a cada turno';
    case 'trap': return 'Prende e machuca por 4 a 5 turnos';
    case 'rest': return 'Cura tudo e dorme 2 turnos';
    default: return null;
  }
}

/** Como o golpe aparece na tela. */
export type MoveVisual = 'punch' | 'kick' | 'bite' | 'slash' | 'slam' | 'beam' | 'wave' | 'storm' | 'orb' | 'aura';

const VISUAL_WORDS: readonly [MoveVisual, readonly string[]][] = [
  ['punch', ['punch', 'hammer-arm', 'meteor-mash', 'bullet-punch']],
  ['kick', ['kick', 'stomp', 'jump', 'trample']],
  ['bite', ['bite', 'fang', 'crunch']],
  ['slash', ['slash', 'claw', 'cut', 'scratch', 'swipes', 'razor-leaf', 'scythe', 'x-scissor']],
  ['slam', ['tackle', 'slam', 'take-down', 'double-edge', 'headbutt', 'ram', 'rush', 'crash', 'strike']],
  ['beam', ['beam', 'ray', 'cannon', 'flamethrower', 'hydro-pump', 'solar']],
  ['wave', ['wave', 'surf', 'quake', 'earth-power', 'fissure', 'magnitude', 'eruption']],
  ['storm', ['storm', 'blizzard', 'gust', 'wind', 'hurricane', 'thunder', 'hail', 'rain', 'rock-slide', 'meteor']],
];

export function moveVisual(slug: string, damageClass: 'physical' | 'special' | 'status'): MoveVisual {
  if (damageClass === 'status') return 'aura';
  for (const [visual, words] of VISUAL_WORDS) if (words.some((word) => slug.includes(word))) return visual;
  return damageClass === 'physical' ? 'slam' : 'orb';
}

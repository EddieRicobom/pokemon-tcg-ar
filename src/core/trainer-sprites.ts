/**
 * Sprites de treinador (os do Pokémon Showdown, no repositório público smogon/sprites, servidos pelo
 * raw.githubusercontent.com com CORS liberado). Todos os endereços abaixo foram conferidos em 2026-10-14.
 * O jogador escolhe o seu (aparece no Treinador, nos Ginásios e no PvP da Caixa); os líderes usam os deles.
 */

export const TRAINER_SPRITE_BASE = 'https://raw.githubusercontent.com/smogon/sprites/master/src/_uncategorized/canonical/trainers';

export interface TrainerSprite {
  id: string;
  label: string;
  /** Caminho dentro de `TRAINER_SPRITE_BASE`, sem a extensão. */
  path: string;
}

const t = (id: string, label: string, path: string): TrainerSprite => ({ id, label, path });

/** Os que o jogador pode escolher: protagonistas, rivais e classes de treinador. */
export const PLAYER_SPRITES: readonly TrainerSprite[] = [
  t('lucas', 'Lucas', 'gen4/platinum/Lucas'),
  t('dawn', 'Dawn', 'gen4/platinum/Dawn'),
  t('red', 'Red', 'gen3/firered-leafgreen/Red'),
  t('leaf', 'Leaf', 'gen3/firered-leafgreen/Leaf'),
  t('ethan', 'Ethan', 'gen4/heartgold-soulsilver/Ethan'),
  t('lyra', 'Lyra', 'gen4/heartgold-soulsilver/Lyra'),
  t('brendan', 'Brendan', 'gen3/emerald/Brendan'),
  t('may', 'May', 'gen3/emerald/May'),
  t('hilbert', 'Hilbert', 'gen5/black-white/Hilbert'),
  t('hilda', 'Hilda', 'gen5/black-white/Hilda'),
  t('nate', 'Nate', 'gen5/black2-white2/Nate'),
  t('rosa', 'Rosa', 'gen5/black2-white2/Rosa'),
  t('blue', 'Blue', 'gen3/firered-leafgreen/Blue'),
  t('silver', 'Silver', 'gen4/heartgold-soulsilver/Silver'),
  t('barry', 'Barry', 'gen4/diamond-pearl/Barry'),
  t('cheren', 'Cheren', 'gen5/black-white/Cheren'),
  t('bianca', 'Bianca', 'gen5/black-white/Bianca'),
  t('n', 'N', 'gen5/black-white/N'),
  t('ace', 'Treinador Ás', 'gen4/diamond-pearl/Ace_Trainer'),
  t('ace-f', 'Treinadora Ás', 'gen4/diamond-pearl/Ace_Trainer~F'),
  t('battle-girl', 'Lutadora', 'gen4/diamond-pearl/Battle_Girl'),
  t('blackbelt', 'Faixa-preta', 'gen4/diamond-pearl/Blackbelt'),
  t('ranger', 'Guarda Pokémon', 'gen4/diamond-pearl/Poke__0301mon_Ranger'),
  t('ranger-f', 'Guarda Pokémon (ela)', 'gen4/diamond-pearl/Poke__0301mon_Ranger~F'),
  t('breeder', 'Criadora', 'gen4/diamond-pearl/Poke__0301mon_Breeder~F'),
  t('dragon', 'Domador de Dragões', 'gen4/diamond-pearl/Dragon_Tamer'),
  t('ninja', 'Ninja', 'gen4/diamond-pearl/Ninja_Boy'),
  t('psychic', 'Médium', 'gen4/diamond-pearl/Psychic~F'),
  t('scientist', 'Cientista', 'gen4/diamond-pearl/Scientist'),
  t('hiker', 'Alpinista', 'gen4/diamond-pearl/Hiker'),
  t('cowgirl', 'Vaqueira', 'gen4/diamond-pearl/Cowgirl'),
  t('artist', 'Artista', 'gen4/diamond-pearl/Artist'),
  t('idol', 'Ídolo', 'gen4/diamond-pearl/Idol'),
  t('rich', 'Garoto Rico', 'gen4/diamond-pearl/Rich_Boy'),
  t('lady', 'Dama', 'gen4/diamond-pearl/Lady'),
  t('fisher', 'Pescador', 'gen4/diamond-pearl/Fisherman'),
  t('bug', 'Caçador de Insetos', 'gen4/diamond-pearl/Bug_Catcher'),
  t('swimmer', 'Nadadora', 'gen4/diamond-pearl/Swimmer~F'),
  t('lass', 'Garota', 'gen4/diamond-pearl/Lass'),
  t('youngster', 'Garoto', 'gen4/diamond-pearl/Youngster'),
];

export const DEFAULT_TRAINER_SPRITE = 'lucas';

const BY_ID = new Map(PLAYER_SPRITES.map((s) => [s.id, s]));

export function normalizeTrainerSprite(id: unknown): string {
  return typeof id === 'string' && BY_ID.has(id) ? id : DEFAULT_TRAINER_SPRITE;
}

export function trainerSprite(id: string): TrainerSprite {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_TRAINER_SPRITE)!;
}

/** Aceita o id do jogador, um caminho dentro de `TRAINER_SPRITE_BASE` ou um endereço completo (os líderes de Kalos). */
export function trainerSpriteUrl(pathOrId: string): string {
  const path = BY_ID.get(pathOrId)?.path ?? pathOrId;
  return path.startsWith('https://') ? `${path}.png` : `${TRAINER_SPRITE_BASE}/${path}.png`;
}

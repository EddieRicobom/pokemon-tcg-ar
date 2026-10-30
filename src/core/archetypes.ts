import evolutionData from './data/pokemon-evolutions.json';
import { baseSpeciesDexId } from './data/pokemon-weapons';
import { generationOf, typesOfDex } from './species-filter';
import { statsOfDex } from './survivor-stats';
import { TYPE_LABELS_PT } from './pokemon-data';
import type { PokemonType } from './pokemon-data';
import type { CardTraits } from './card-traits';

/**
 * Arquétipos: etiquetas que agrupam Pokémon por carta (mecânica, raridade, coleção), por espécie (tipo, categoria,
 * estágio, região) e por perfil de stats. Servem hoje para mostrar e filtrar e, no futuro, para bônus de equipe: membros
 * que dividem arquétipos com outros da mesma equipe poderão ganhar efeitos nos modos de jogo. Por isso os ids são
 * ESTÁVEIS: nunca renomeie um id, só acrescente.
 *
 * Retrocompatível: a detecção usa só o que cada fonte tem. Cartas antigas (sem `traits`) ganham os arquétipos que saem
 * do nome, da raridade, da coleção e da espécie; os que dependem de `traits` aparecem quando a carta for escaneada de
 * novo. Digital Pokémon (sem carta) ganham os de espécie e de stats, mais «Digital». Nada é sorteado nem inventado.
 */

export type ArchetypeGroup = 'mecanica' | 'raridade' | 'colecao' | 'tipo' | 'categoria' | 'estagio' | 'regiao' | 'estilo' | 'especial';
/** De onde o arquétipo sai: da carta física (não vale para Digital), da espécie ou dos stats (valem para todos). */
export type ArchetypeSource = 'carta' | 'especie' | 'stats';

export interface Archetype {
  id: string;
  name: string;
  group: ArchetypeGroup;
  icon: string;
  source: ArchetypeSource;
  description: string;
}

export const GROUP_LABELS: Readonly<Record<ArchetypeGroup, string>> = {
  mecanica: 'Mecânica da carta', raridade: 'Raridade', colecao: 'Coleção', tipo: 'Tipo', categoria: 'Categoria da espécie',
  estagio: 'Estágio', regiao: 'Região', estilo: 'Estilo de luta', especial: 'Especial',
};

const TYPE_ICONS: Readonly<Record<PokemonType, string>> = {
  normal: '⚪', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️', fighting: '🥊', poison: '☠️', ground: '⛰️',
  flying: '🪽', psychic: '🔮', bug: '🐛', rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '✨',
};
const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'] as const;

const a = (id: string, name: string, group: ArchetypeGroup, icon: string, source: ArchetypeSource, description: string): Archetype => ({ id, name, group, icon, source, description });

export const ARCHETYPES: readonly Archetype[] = [
  // Mecânica da carta (era e sufixo impressos).
  a('ex-antigo', 'ex (EX Ruby & Sapphire)', 'mecanica', '🔶', 'carta', 'Pokémon-ex das coleções EX (2003–2007).'),
  a('lv-x', 'LV.X', 'mecanica', '🔺', 'carta', 'Nível X das coleções Diamond & Pearl e Platinum.'),
  a('prime', 'Prime', 'mecanica', '💠', 'carta', 'Pokémon Prime de HeartGold & SoulSilver.'),
  a('legend', 'LEGEND', 'mecanica', '🧩', 'carta', 'Cartas LEGEND em duas metades (HGSS).'),
  a('ex-maiusculo', 'EX', 'mecanica', '🟥', 'carta', 'Pokémon-EX de Black & White e XY.'),
  a('mega-evolucao', 'Mega Evolução', 'mecanica', '🧬', 'carta', 'Carta de Mega Evolução (M Pokémon-EX ou Mega ex).'),
  a('primal', 'Primitivo', 'mecanica', '🌋', 'carta', 'Reversão Primitiva (Groudon e Kyogre Primitivos).'),
  a('break', 'BREAK', 'mecanica', '🟨', 'carta', 'Evolução BREAK (carta deitada, de XY).'),
  a('gx', 'GX', 'mecanica', '🌀', 'carta', 'Pokémon-GX de Sun & Moon.'),
  a('tag-team', 'TAG TEAM', 'mecanica', '🤝', 'carta', 'Dois ou três Pokémon na mesma carta GX.'),
  a('prisma', 'Estrela Prisma', 'mecanica', '◇', 'carta', 'Cartas Prism Star (◇): só uma por deck.'),
  a('v', 'V', 'mecanica', '🟩', 'carta', 'Pokémon V de Sword & Shield.'),
  a('vmax', 'VMAX', 'mecanica', '🟪', 'carta', 'Dinamax/Gigantamax em carta VMAX.'),
  a('vstar', 'VSTAR', 'mecanica', '⭐', 'carta', 'Pokémon VSTAR e seu poder VSTAR.'),
  a('v-union', 'V-UNION', 'mecanica', '🧱', 'carta', 'Cartas V-UNION montadas em quatro partes.'),
  a('radiante', 'Radiante', 'mecanica', '🌟', 'carta', 'Pokémon Radiante: só um por deck.'),
  a('ex-moderno', 'ex (Scarlet & Violet)', 'mecanica', '🔷', 'carta', 'Pokémon ex da era Scarlet & Violet.'),
  a('tera', 'Tera', 'mecanica', '💎', 'carta', 'Pokémon ex Terastalizado (cristal na arte).'),
  a('golpe-unico', 'Golpe Único', 'mecanica', '🥋', 'carta', 'Estilo de batalha Golpe Único (Single Strike).'),
  a('golpe-fluido', 'Golpe Fluido', 'mecanica', '🌊', 'carta', 'Estilo de batalha Golpe Fluido (Rapid Strike).'),
  a('golpe-fusao', 'Golpe Fusão', 'mecanica', '🔗', 'carta', 'Estilo de batalha Golpe Fusão (Fusion Strike).'),
  a('sombrio', 'Sombrio / Dark', 'mecanica', '🌘', 'carta', 'Pokémon «Dark» das coleções clássicas.'),
  a('luz', 'Luz / Light', 'mecanica', '🌕', 'carta', 'Pokémon «Light» de Neo Destiny.'),
  a('brilhante', 'Brilhante (Shining)', 'mecanica', '✴️', 'carta', 'Shining Pokémon das coleções Neo e Shining Legends.'),
  a('estrela', 'Pokémon Estrela', 'mecanica', '☆', 'carta', 'Pokémon ☆ (Gold Star) das coleções EX.'),
  a('delta', 'Espécie Delta', 'mecanica', 'δ', 'carta', 'Pokémon δ com tipo diferente do normal.'),
  a('treinador-dono', 'Pokémon de Treinador', 'mecanica', '🧢', 'carta', 'Pokémon de um treinador (Brock’s, Misty’s, de Rocket, de Ethan…).'),
  a('equipe-vilao', 'Equipe Vilã', 'mecanica', '🚀', 'carta', 'Pokémon da Equipe Rocket, Magma, Aqua, Galáctica, Plasma…'),
  // Raridade e acabamento.
  a('comum', 'Comum', 'raridade', '●', 'carta', 'Raridade comum.'),
  a('incomum', 'Incomum', 'raridade', '◆', 'carta', 'Raridade incomum.'),
  a('rara', 'Rara', 'raridade', '★', 'carta', 'Raridade rara.'),
  a('holo', 'Holo', 'raridade', '🪩', 'carta', 'Rara holográfica.'),
  a('dupla-rara', 'Dupla Rara', 'raridade', '★★', 'carta', 'Double Rare (ex comuns de Scarlet & Violet).'),
  a('ultra-rara', 'Ultra Rara', 'raridade', '💫', 'carta', 'Ultra Rara / Full Art.'),
  a('full-art', 'Full Art', 'raridade', '🖼️', 'carta', 'Arte que ocupa a carta inteira.'),
  a('ilustracao', 'Rara Ilustração', 'raridade', '🎨', 'carta', 'Illustration Rare: arte de cena, sem moldura.'),
  a('ilustracao-especial', 'Ilustração Especial', 'raridade', '🖌️', 'carta', 'Special Illustration Rare (arte alternativa).'),
  a('arco-iris', 'Arco-íris', 'raridade', '🌈', 'carta', 'Rainbow Rare (Hyper Rare das eras GX e V).'),
  a('dourada', 'Dourada', 'raridade', '🥇', 'carta', 'Gold / Hyper Rare.'),
  a('secreta', 'Secreta', 'raridade', '🔒', 'carta', 'Número acima do total oficial da coleção.'),
  a('shiny-carta', 'Carta Shiny', 'raridade', '✨', 'carta', 'Shiny Rare / Shiny Vault / Amazing Rare.'),
  a('amazing', 'Incrível (Amazing)', 'raridade', '🌠', 'carta', 'Amazing Rare de Sword & Shield.'),
  a('ace-spec', 'ACE SPEC', 'raridade', '🃏', 'carta', 'ACE SPEC: só uma por deck.'),
  // Coleção.
  a('promo', 'Promo', 'colecao', '🎟️', 'carta', 'Carta promocional.'),
  a('galeria', 'Galeria', 'colecao', '🏛️', 'carta', 'Trainer Gallery, Galarian Gallery ou Character Rare.'),
  a('classica-wotc', 'Clássica (WOTC)', 'colecao', '📜', 'carta', 'Coleções da Wizards of the Coast (Base a Skyridge).'),
  a('regulacao', 'Marca de regulação', 'colecao', '🔤', 'carta', 'Carta com marca de regulação (D em diante).'),
  // Tipos (da espécie, valem para Digital).
  ...(Object.keys(TYPE_ICONS) as PokemonType[]).map((t) => a(`tipo-${t}`, TYPE_LABELS_PT[t], 'tipo', TYPE_ICONS[t], 'especie', `Pokémon do tipo ${TYPE_LABELS_PT[t]}.`)),
  a('monotipo', 'Monotipo', 'tipo', '①', 'especie', 'Um tipo só.'),
  a('dois-tipos', 'Dois tipos', 'tipo', '②', 'especie', 'Dois tipos.'),
  // Categoria da espécie.
  a('inicial', 'Inicial', 'categoria', '🎒', 'especie', 'Um dos iniciais de alguma região (com as evoluções).'),
  a('bebe', 'Bebê', 'categoria', '🍼', 'especie', 'Pokémon bebê.'),
  a('fossil', 'Fóssil', 'categoria', '🦴', 'especie', 'Revivido de um fóssil.'),
  a('pseudo-lendario', 'Pseudolendário', 'categoria', '🐲', 'especie', 'Linha de três estágios com 600 de stats no fim.'),
  a('lendario', 'Lendário', 'categoria', '🏛️', 'especie', 'Pokémon lendário.'),
  a('mitico', 'Mítico', 'categoria', '🌌', 'especie', 'Pokémon mítico (de evento).'),
  a('ultracriatura', 'Ultracriatura', 'categoria', '🕳️', 'especie', 'Ultra Beast de outro mundo.'),
  a('paradoxo', 'Paradoxo', 'categoria', '⏳', 'especie', 'Forma Paradoxo, antiga ou futura.'),
  a('forma-regional', 'Forma regional', 'categoria', '🗺️', 'especie', 'Forma de Alola, Galar, Hisui ou Paldea.'),
  // Estágio (pela linha evolutiva; bebês não contam, como no TCG).
  a('basico', 'Básico', 'estagio', '①', 'especie', 'Não evolui de ninguém (sem contar bebês).'),
  a('estagio-1', 'Estágio 1', 'estagio', '②', 'especie', 'Evolui uma vez.'),
  a('estagio-2', 'Estágio 2', 'estagio', '③', 'especie', 'Evolui duas vezes.'),
  a('final', 'Forma final', 'estagio', '🏁', 'especie', 'Não evolui mais.'),
  // Região de origem.
  ...REGIONS.map((r) => a(`regiao-${r.toLowerCase()}`, r, 'regiao', '📍', 'especie', `Espécie apresentada em ${r}.`)),
  // Estilo de luta (stats base).
  a('atacante-fisico', 'Atacante físico', 'estilo', '🗡️', 'stats', 'Attack é o maior stat de ataque, e alto (≥ 100).'),
  a('atacante-especial', 'Atacante especial', 'estilo', '🪄', 'stats', 'Special Attack é o maior stat de ataque, e alto (≥ 100).'),
  a('muralha', 'Muralha', 'estilo', '🛡️', 'stats', 'Defense + Special Defense bem acima dos ataques.'),
  a('velocista', 'Velocista', 'estilo', '💨', 'stats', 'Speed ≥ 100.'),
  a('tanque', 'Tanque', 'estilo', '🧱', 'stats', 'HP ≥ 100.'),
  a('vidro', 'Canhão de vidro', 'estilo', '🔭', 'stats', 'Ataca forte (≥ 100) e aguenta pouco (defesas somadas < 140).'),
  a('equilibrado', 'Equilibrado', 'estilo', '⚖️', 'stats', 'Nenhum stat se destaca muito (todos entre 60 e 110).'),
  a('peso-pesado', 'Peso-pesado', 'estilo', '🏋️', 'stats', 'Soma de stats ≥ 580 (fora lendários e míticos).'),
  // Especial.
  a('shiny', 'Shiny', 'especial', '✨', 'especie', 'Sorteado shiny no escaneamento ou invocado shiny.'),
  a('mega', 'Mega', 'especial', '🧬', 'especie', 'Escaneado como carta Mega.'),
  a('digital', 'Digital', 'especial', '💾', 'especie', 'Digital Pokémon, sem carta física.'),
  a('carta-fisica', 'Carta física', 'especial', '🃏', 'carta', 'Veio de uma carta escaneada.'),
];

const BY_ID = new Map(ARCHETYPES.map((x) => [x.id, x]));
export function archetype(id: string): Archetype | null {
  return BY_ID.get(id) ?? null;
}

// ---------------------------------------------------------------------------------------------- listas de espécies

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const STARTERS = new Set([...range(1, 9), ...range(152, 160), ...range(252, 260), ...range(387, 395), ...range(495, 503), ...range(650, 658), ...range(722, 730), ...range(810, 818), ...range(906, 914)]);
const BABIES = new Set([172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458, 848]);
const FOSSILS = new Set([...range(138, 142), ...range(345, 348), ...range(408, 411), ...range(564, 567), ...range(696, 699), ...range(880, 883)]);
const PSEUDO = new Set([...range(147, 149), ...range(246, 248), ...range(371, 376), ...range(443, 445), ...range(633, 635), ...range(704, 706), ...range(782, 784), ...range(885, 887), ...range(996, 998)]);
const LEGENDARY = new Set([...range(144, 146), 150, ...range(243, 245), 249, 250, ...range(377, 384), ...range(480, 488), ...range(638, 646), ...range(716, 718), 772, 773, ...range(785, 792), 800, ...range(888, 892), ...range(894, 898), 905, ...range(1001, 1004), 1007, 1008, ...range(1014, 1017), 1024]);
const MYTHICAL = new Set([151, 251, 385, 386, ...range(489, 494), ...range(647, 649), ...range(719, 721), 801, 802, ...range(807, 809), 893, 1025]);
const ULTRA_BEASTS = new Set([...range(793, 799), ...range(803, 806)]);
const PARADOX = new Set([...range(984, 995), 1005, 1006, 1009, 1010, ...range(1020, 1023)]);

const FROM: readonly number[] = evolutionData.from;
/** Estágio na linha evolutiva (0 = básico), sem contar bebês como estágio — como no TCG. */
export function evolutionStage(dexId: number): number {
  let stage = 0;
  let cur = dexId;
  for (let guard = 0; guard < 4; guard++) {
    const prev = FROM[cur] ?? 0;
    if (!prev || BABIES.has(prev)) break;
    stage++;
    cur = prev;
  }
  return stage;
}
const evolvesFurther = (dexId: number): boolean => FROM.some((p, id) => id > 0 && p === dexId);

// ---------------------------------------------------------------------------------------------- detecção

export interface ArchetypeSubject {
  /** Espécie ou forma (id 10001+ para formas regionais e Mega). */
  dexId: number;
  /** Nome impresso na carta (ausente em Digital). */
  name?: string;
  rarity?: string;
  setId?: string;
  setName?: string;
  localId?: string;
  setOfficial?: number;
  traits?: CardTraits;
  shiny?: boolean;
  mega?: boolean;
  digital?: boolean;
}

const WOTC_SETS = /^(base\d|basep|gym\d|neo\d|lc|si1|ecard\d|wizpromos?)$/i;
const VILLAINS = /\b(team rocket|rocket'?s|equipe rocket|team magma|magma'?s|team aqua|aqua'?s|team galactic|galactic'?s|team plasma|plasma|team flare|team skull|team yell|team star)\b/i;

function cardArchetypes(c: ArchetypeSubject, out: Set<string>): void {
  const name = c.name ?? '';
  const suffix = c.traits?.suffix ?? '';
  const stage = (c.traits?.stage ?? '').toUpperCase();
  const rarity = (c.rarity ?? '').toLowerCase();
  const setId = (c.setId ?? '').toLowerCase();
  const has = (re: RegExp) => re.test(name);
  out.add('carta-fisica');

  // Mecânica: sufixo do TCGdex quando houver, senão o nome.
  if (stage === 'VMAX' || suffix === 'VMAX' || has(/\bVMAX\b/)) out.add('vmax');
  else if (stage === 'VSTAR' || suffix === 'VSTAR' || has(/\bVSTAR\b/)) out.add('vstar');
  else if (has(/\bV-UNION\b/i)) out.add('v-union');
  else if (suffix === 'V' || has(/\sV$/)) out.add('v');
  if (suffix === 'GX' || has(/[-\s]GX\b/)) out.add(has(/&/) ? 'tag-team' : 'gx');
  if (suffix === 'EX' || has(/-EX\b/)) out.add('ex-maiusculo');
  if (suffix === 'ex' || has(/\sex\b/)) out.add(/^(sv|me)/.test(setId) ? 'ex-moderno' : 'ex-antigo');
  if (stage === 'BREAK' || has(/\bBREAK\b/)) out.add('break');
  if (stage.includes('LEVEL') || has(/\bLV\.?\s?X\b/i)) out.add('lv-x');
  if (has(/\bLEGEND\b/)) out.add('legend');
  if (/prime/.test(rarity) || has(/\bPrime\b/)) out.add('prime');
  if (c.mega || stage === 'MEGA' || has(/^(M |Mega )/)) out.add('mega-evolucao');
  if (has(/^(Primal|Primitivo)/i)) out.add('primal');
  if (has(/◇|Prism Star/i)) out.add('prisma');
  if (has(/^(Radiant |Radiante )|\sRadiante$/i) || /radiant/.test(rarity)) out.add('radiante');
  if (has(/\bTera\b/i)) out.add('tera');
  if (has(/Single Strike|Golpe Único|Golpe Unico/i)) out.add('golpe-unico');
  if (has(/Rapid Strike|Golpe Fluido/i)) out.add('golpe-fluido');
  if (has(/Fusion Strike|Golpe Fusão|Golpe Fusao/i)) out.add('golpe-fusao');
  if (has(/^(Dark |Sombrio )/i)) out.add('sombrio');
  if (has(/^(Light |Luz )/i)) out.add('luz');
  if (has(/^(Shining |Brilhante )/i)) out.add('brilhante');
  if (has(/☆|\bStar$/)) out.add('estrela');
  if (has(/δ/) || /delta/i.test(name)) out.add('delta');
  if (VILLAINS.test(name)) out.add('equipe-vilao');
  else if (has(/^[A-Z][a-zA-Z.]+['’]s\s|\sde [A-Z][a-z]+$/)) out.add('treinador-dono');

  // Raridade (texto do TCGdex, em inglês; testamos do mais específico ao mais geral).
  if (/special illustration/.test(rarity)) out.add('ilustracao-especial');
  else if (/illustration/.test(rarity)) out.add('ilustracao');
  if (/hyper|gold/.test(rarity)) out.add('dourada');
  if (/rainbow/.test(rarity)) out.add('arco-iris');
  if (/amazing/.test(rarity)) { out.add('amazing'); out.add('shiny-carta'); }
  if (/shiny/.test(rarity)) out.add('shiny-carta');
  if (/ace spec/.test(rarity)) out.add('ace-spec');
  if (/double rare/.test(rarity)) out.add('dupla-rara');
  if (/ultra|full art/.test(rarity)) out.add('ultra-rara');
  if (/full art|ultra|illustration|rainbow|hyper|gold/.test(rarity)) out.add('full-art');
  if (/holo/.test(rarity)) out.add('holo');
  if (/secret/.test(rarity)) out.add('secreta');
  if (rarity === 'common' || rarity === 'comum') out.add('comum');
  else if (rarity === 'uncommon' || rarity === 'incomum') out.add('incomum');
  else if (/^rare$|^rara$|^rare holo|^rara holo/.test(rarity)) out.add('rara');

  // Número secreto: acima do total oficial (só quando o número é puramente numérico).
  const num = /^\d+$/.test(c.localId ?? '') ? Number(c.localId) : NaN;
  if (Number.isFinite(num) && (c.setOfficial ?? 0) > 0 && num > c.setOfficial!) out.add('secreta');

  // Coleção.
  if (/promo/i.test(c.setName ?? '') || /^(svp|swshp|smp|xyp|bwp|hgssp|dpp|np|basep|mep)$/.test(setId)) out.add('promo');
  if (/^(TG|GG|SV)\d/i.test(c.localId ?? '') || /character/.test(rarity)) out.add('galeria');
  if (WOTC_SETS.test(setId)) out.add('classica-wotc');
  if (c.traits?.regulationMark) out.add('regulacao');
}

function speciesArchetypes(dexId: number, out: Set<string>): void {
  const base = baseSpeciesDexId(dexId) ?? dexId;
  const types = typesOfDex(dexId).length ? typesOfDex(dexId) : typesOfDex(base);
  for (const t of types) out.add(`tipo-${t}`);
  if (types.length === 1) out.add('monotipo');
  if (types.length === 2) out.add('dois-tipos');
  if (STARTERS.has(base)) out.add('inicial');
  if (BABIES.has(base)) out.add('bebe');
  if (FOSSILS.has(base)) out.add('fossil');
  if (PSEUDO.has(base)) out.add('pseudo-lendario');
  if (LEGENDARY.has(base)) out.add('lendario');
  if (MYTHICAL.has(base)) out.add('mitico');
  if (ULTRA_BEASTS.has(base)) out.add('ultracriatura');
  if (PARADOX.has(base)) out.add('paradoxo');
  if (dexId > 10000 && base !== dexId) out.add('forma-regional');
  if (!BABIES.has(base)) {
    const stage = evolutionStage(base);
    out.add(stage === 0 ? 'basico' : stage === 1 ? 'estagio-1' : 'estagio-2');
  }
  if (!evolvesFurther(base)) out.add('final');
  const gen = generationOf(base);
  if (gen) out.add(`regiao-${REGIONS[gen - 1]!.toLowerCase()}`);

  const s = statsOfDex(dexId) ?? statsOfDex(base);
  if (!s) return;
  const total = s.hp + s.attack + s.defense + s.spAttack + s.spDefense + s.speed;
  const bulk = s.defense + s.spDefense;
  const offense = Math.max(s.attack, s.spAttack);
  if (s.attack >= s.spAttack && s.attack >= 100) out.add('atacante-fisico');
  if (s.spAttack > s.attack && s.spAttack >= 100) out.add('atacante-especial');
  if (bulk >= (s.attack + s.spAttack) * 1.3 && bulk >= 180) out.add('muralha');
  if (s.speed >= 100) out.add('velocista');
  if (s.hp >= 100) out.add('tanque');
  if (offense >= 100 && bulk < 140) out.add('vidro');
  if ([s.hp, s.attack, s.defense, s.spAttack, s.spDefense, s.speed].every((v) => v >= 60 && v <= 110)) out.add('equilibrado');
  if (total >= 580 && !LEGENDARY.has(base) && !MYTHICAL.has(base)) out.add('peso-pesado');
}

/** Os arquétipos de um Pokémon (carta escaneada ou Digital), na ordem da tabela. */
export function archetypesOf(subject: ArchetypeSubject): string[] {
  const out = new Set<string>();
  if (Number.isInteger(subject.dexId) && subject.dexId > 0) speciesArchetypes(subject.dexId, out);
  if (subject.digital) out.add('digital');
  else if (subject.name !== undefined) cardArchetypes(subject, out);
  if (subject.shiny) out.add('shiny');
  if (subject.mega) out.add('mega');
  return ARCHETYPES.filter((x) => out.has(x.id)).map((x) => x.id);
}

/**
 * Preparado para os bônus de equipe (ainda não usados): quantos membros da equipe têm cada arquétipo. Um arquétipo com
 * 2 ou mais membros é «compartilhado» e poderá dar efeito nos modos de jogo.
 */
export function teamArchetypes(members: readonly ArchetypeSubject[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of members) for (const id of archetypesOf(m)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return ARCHETYPES.filter((x) => counts.has(x.id)).map((x) => ({ id: x.id, count: counts.get(x.id)! }));
}

import type { Rng } from '../battle';
import { add, canAfford, friendOf, itemName, pay } from './life';
import type { Interaction, ItemId, VillageState } from './life';
import { FURNITURE_IDS, itemDef } from './catalog';
import { emptyHomeInterior, normalizeHomeInterior } from './home-interior';
import type { HomeInterior } from './home-interior';
import { cutsOff, isFront, isSolidTile, tileAt } from './map';
import type { VillageMap } from './map';
import { hash, personalityOf } from './personality';
import { CIVIC, HOME_EXTERIOR_STYLES, LOTS, TOWN_STAGES, townStage } from './town-layout';
import type { HomeExteriorStyle } from './town-layout';
import type { Building } from './town-layout';
import { homeLevel, homeDecor, homeRoof, homeValue } from './home-state';
import { findHomeFurnitureSlot } from './home-layout';
export { homeLevel, homeDecor, homeRoof, homeValue } from './home-state';

export { buildingAt } from './map';
export { CIVIC, LOTS, TOWN_STAGES, townStage };
export { HOME_EXTERIOR_STYLES };
export type { HomeExteriorStyle };
export type { Building };

/**
 * A mini cidade da Vila (estilo Animal Crossing): cada Pokémon mora numa casa de um terreno liberado pelo seu nível de
 * Treinador; você melhora a casa com materiais, decora e pinta o telhado com moedas. A praça ganha Café, Correio e Museu.
 * Tudo puro; o desenho fica em `village/town-art.ts` e a conversa com os prédios, em `VillageView.vue`.
 */

// ----------------------------------------------------------------------------- casas

export interface HomeStage {
  name: string;
  cost: Partial<Record<ItemId, number>>;
}

/** Nível 0 já vem construído (a cabana); os outros você paga. */
export const HOME_STAGES: readonly HomeStage[] = [
  { name: 'Cabana', cost: {} },
  { name: 'Casa de madeira', cost: { madeira: 10, pedra: 4 } },
  { name: 'Casa de tijolos', cost: { madeira: 16, pedra: 14 } },
  { name: 'Sobrado', cost: { madeira: 24, pedra: 20, concha: 3 } },
  { name: 'Sobrado com varanda', cost: { tabua: 12, tijolo: 8, vidro: 3 } },
  { name: 'Solar da Vila', cost: { tabua: 18, tijolo: 14, vidro: 6, flor: 12 } },
];

export interface DecorDef {
  id: 'flores' | 'cerca' | 'luz' | 'correio';
  bit: number;
  name: string;
  cost: number;
}

export const HOME_DECORS: readonly DecorDef[] = [
  { id: 'flores', bit: 1, name: 'Jardineira de flores', cost: 25 },
  { id: 'cerca', bit: 2, name: 'Cerquinha branca', cost: 35 },
  { id: 'luz', bit: 4, name: 'Lampião na porta', cost: 45 },
  { id: 'correio', bit: 8, name: 'Caixa de correio', cost: 20 },
];

/** Cores de telhado: 0 = a do terreno; 1 a 6 = as que você pinta. */
export const ROOFS: readonly { name: string; rgb: number }[] = [
  { name: 'Vermelho', rgb: 0xd8463c },
  { name: 'Azul', rgb: 0x3f6fd0 },
  { name: 'Verde', rgb: 0x3f9a44 },
  { name: 'Amarelo', rgb: 0xe8b830 },
  { name: 'Roxo', rgb: 0x8a52c8 },
  { name: 'Rosa', rgb: 0xe878a8 },
];
export const PAINT_COST = 15;

export const homeOf = (s: VillageState, lot: number): number => s.homes[String(lot)] ?? 0;

/** O telhado que a casa mostra: o escolhido ou, se você nunca pintou, o do terreno. */
export function roofIndex(v: number, lot: number): number {
  const r = homeRoof(v);
  return r > 0 && r <= ROOFS.length ? r - 1 : lot % ROOFS.length;
}

/** Terrenos liberados no nível de Treinador `level`. */
export function unlockedLots(level: number): number[] {
  return LOTS.map((l, i) => (level >= l.unlock ? i : -1)).filter((i) => i >= 0);
}

/**
 * Quem mora onde: os Pokémon, em ordem fixa (pelo id), ocupam os terrenos liberados na ordem; se há mais Pokémon que casas,
 * dividem a casa. Sem terrenos liberados ainda: ninguém tem casa (mas o nível 1 já libera 3).
 */
export function assignHomes(ids: readonly string[], level: number): Map<string, number> {
  const lots = unlockedLots(level);
  const out = new Map<string, number>();
  if (lots.length === 0) return out;
  [...ids].sort().forEach((id, i) => out.set(id, lots[i % lots.length]!));
  return out;
}

export function residentsOf(homes: ReadonlyMap<string, number>, lot: number): string[] {
  return [...homes].filter(([, l]) => l === lot).map(([id]) => id);
}

export function upgradeHome(s: VillageState, lot: number, residents: readonly string[]): Interaction {
  const v = homeOf(s, lot);
  const lvl = homeLevel(v);
  const next = HOME_STAGES[lvl + 1];
  if (!next) return { ok: false, message: 'Esta casa já completou todas as reformas!' };
  if (!canAfford(s, next.cost)) {
    const lack = Object.entries(next.cost).filter(([k, n]) => (s.inventory[k as ItemId] ?? 0) < (n ?? 0)).map(([k, n]) => `${itemName(k as ItemId)} ${Math.min(s.inventory[k as ItemId] ?? 0, n ?? 0)}/${n}`);
    return { ok: false, message: `Para a ${next.name} faltam: ${lack.join(', ')}.` };
  }
  pay(s, next.cost);
  s.homes[String(lot)] = homeValue(lvl + 1, homeDecor(v), homeRoof(v));
  for (const id of residents) {
    const f = friendOf(s, id);
    f.points = Math.min(100, f.points + 4);
  }
  return { ok: true, message: `Você reformou: ${next.name}! Quem mora lá adorou.` };
}

/** Liga ou desliga um enfeite. Ligar custa moedas; desligar é de graça. */
export function toggleDecor(s: VillageState, lot: number, decor: DecorDef, residents: readonly string[]): Interaction {
  const v = homeOf(s, lot);
  if (homeDecor(v) & decor.bit) {
    s.homes[String(lot)] = homeValue(homeLevel(v), homeDecor(v) & ~decor.bit, homeRoof(v));
    return { ok: true, message: `Você tirou: ${decor.name}.` };
  }
  if (s.coins < decor.cost) return { ok: false, message: `${decor.name} custa ${decor.cost} moedas.` };
  s.coins -= decor.cost;
  s.homes[String(lot)] = homeValue(homeLevel(v), homeDecor(v) | decor.bit, homeRoof(v));
  for (const id of residents) {
    const f = friendOf(s, id);
    f.points = Math.min(100, f.points + 2);
  }
  return { ok: true, message: `Você colocou: ${decor.name}!` };
}

export function paintRoof(s: VillageState, lot: number, roof: number, residents: readonly string[]): Interaction {
  const v = homeOf(s, lot);
  if (roof < 0 || roof >= ROOFS.length) return { ok: false, message: '' };
  if (roofIndex(v, lot) === roof && homeRoof(v) > 0) return { ok: false, message: 'O telhado já está dessa cor.' };
  if (s.coins < PAINT_COST) return { ok: false, message: `A tinta custa ${PAINT_COST} moedas.` };
  s.coins -= PAINT_COST;
  s.homes[String(lot)] = homeValue(homeLevel(v), homeDecor(v), roof + 1);
  for (const id of residents) {
    const f = friendOf(s, id);
    f.points = Math.min(100, f.points + 1);
  }
  return { ok: true, message: `Telhado ${ROOFS[roof]!.name.toLowerCase()} pronto!` };
}

export function homeStyleOf(s: VillageState, lot: number): HomeExteriorStyle {
  const chosen = s.homeStyles[String(lot)];
  return HOME_EXTERIOR_STYLES.some((style) => style.id === chosen) ? chosen as HomeExteriorStyle : HOME_EXTERIOR_STYLES[Math.abs(lot) % 4]!.id;
}

/** Troca a linguagem visual da fachada; o telhado e os enfeites continuam independentes. */
export function setHomeStyle(s: VillageState, lot: number, style: HomeExteriorStyle, residents: readonly string[]): Interaction {
  const chosen = HOME_EXTERIOR_STYLES.find((entry) => entry.id === style);
  if (!chosen) return { ok: false, message: 'Esse estilo de fachada não existe.' };
  if (homeStyleOf(s, lot) === style && s.homeStyles[String(lot)] === style) return { ok: false, message: 'A fachada já está nesse estilo.' };
  if (s.coins < chosen.cost) return { ok: false, message: `${chosen.name} custa ${chosen.cost} moedas.` };
  s.coins -= chosen.cost;
  s.homeStyles[String(lot)] = style;
  // Uma escolha manual ganha pelo menos uma semana antes de outra iniciativa do morador.
  const project = s.homeProjects[String(lot)];
  if (project) project.lastChangeDay = project.day;
  for (const id of residents) friendOf(s, id).points = Math.min(100, friendOf(s, id).points + 1);
  return { ok: true, message: `Fachada ${chosen.name.toLowerCase()} pronta: ${chosen.description}.` };
}

export const RESIDENT_HOME_PREFS: Readonly<Record<string, { style: HomeExteriorStyle; wallpaper: HomeInterior['wallpaper']; floor: HomeInterior['floor']; items: readonly string[] }>> = {
  Brincalhão: { style: 'festivo', wallpaper: 'floral', floor: 'grama', items: ['pelucia', 'almofadas', 'mesa-jantar', 'maquina-gacha', 'sofa-nuvem', 'tapete-folha'] },
  Calmo: { style: 'jardim', wallpaper: 'noite', floor: 'carvalho', items: ['samambaia', 'poltrona', 'estante-plantas', 'luminaria-leitura', 'aquario', 'cesto-la'] },
  Tímido: { style: 'rústico', wallpaper: 'madeira', floor: 'xadrez', items: ['tapete', 'estante', 'comoda', 'cesto-la', 'almofadas', 'luminaria-leitura'] },
  Corajoso: { style: 'serrano', wallpaper: 'madeira', floor: 'ladrilho', items: ['mapa-parede', 'trofeu', 'aparador', 'mesa-estudos', 'piano', 'relogio-parede'] },
  Guloso: { style: 'tradicional', wallpaper: 'floral', floor: 'xadrez', items: ['mesa-cha', 'geladeira', 'fogao', 'balcao-cozinha', 'armario-loucas', 'prateleira-canecas'] },
  Sonhador: { style: 'noturno', wallpaper: 'noite', floor: 'carvalho', items: ['globo', 'quadro-mar', 'sofa-nuvem', 'mapa-parede', 'almofadas', 'luminaria-leitura'] },
  Curioso: { style: 'praiano', wallpaper: 'creme', floor: 'ladrilho', items: ['mesa-estudos', 'aquario', 'computador', 'maquina-gacha', 'mapa-parede', 'estante'] },
  Mandão: { style: 'moderno', wallpaper: 'creme', floor: 'ladrilho', items: ['estante', 'televisao', 'trofeu', 'aparador', 'relogio-parede', 'mesa-jantar'] },
};

export interface ResidentHomeChange {
  lot: number;
  residentId: string;
  style: HomeExteriorStyle;
  items: string[];
  renovation?: string;
  restyled?: boolean;
}

/** Moradores compram peças com o próprio orçamento simulado; isso não retira itens da mochila do jogador. */
export function personalizeResidentHomes(s: VillageState, homes: ReadonlyMap<string, number>): ResidentHomeChange[] {
  const groups = new Map<number, string[]>();
  for (const [id, lot] of homes) groups.set(lot, [...(groups.get(lot) ?? []), id]);
  const changes: ResidentHomeChange[] = [];
  for (const [lot, ids] of groups) {
    const residentId = [...ids].sort()[0];
    if (!residentId) continue;
    const personality = personalityOf(residentId).name;
    const pref = RESIDENT_HOME_PREFS[personality] ?? RESIDENT_HOME_PREFS.Calmo!;
    const key = String(lot);
    const interior = s.homeInteriors[key] ? normalizeHomeInterior(s.homeInteriors[key]) : emptyHomeInterior();
    const before = JSON.stringify(interior);
    if (!s.homeInteriors[key]) { interior.wallpaper = pref.wallpaper; interior.floor = pref.floor; }
    // Kit de mudança único: cama e uma peça pessoal. As próximas compras usam a poupança doméstica.
    const target = 2;
    const bought: string[] = [];
    for (const id of ['cama', ...pref.items]) {
      if (interior.placed.length >= target || !FURNITURE_IDS.includes(id) || interior.placed.some((entry) => entry.item === id)) continue;
      const slot = findHomeFurnitureSlot(interior, id);
      if (!slot) break;
      interior.placed.push({ ...slot, item: id });
      bought.push(itemDef(id)?.name ?? id);
    }
    s.homeInteriors[key] = interior;
    if (!s.homeStyles[key]) s.homeStyles[key] = pref.style;
    if (before !== JSON.stringify(interior) || bought.length > 0) changes.push({ lot, residentId, style: pref.style, items: bought });
  }
  return changes;
}

/** O que os moradores comentam quando você espia a casa. */
export function homeComment(s: VillageState, lot: number, names: readonly string[], asleep: boolean, rng: Rng): string {
  const who = names.length === 0 ? 'Ninguém' : names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  if (names.length === 0) return 'Terreno livre. Quando você tiver mais Pokémon na caixa, um deles constrói a casa aqui e vem morar.';
  if (asleep) return `💤 ${who} ${names.length > 1 ? 'dormem' : 'dorme'} profundamente. Melhor não fazer barulho.`;
  const v = homeOf(s, lot);
  const lvl = homeLevel(v);
  const d = homeDecor(v);
  const lines: string[] = [];
  if (d & 1) lines.push(`${who}: "As flores na janela são o meu orgulho!"`);
  if (d & 2) lines.push(`${who}: "A cerquinha deixou a casa com cara de cartão-postal."`);
  if (d & 4) lines.push(`${who}: "Com o lampião na porta eu nunca mais erro o caminho de volta."`);
  if (d & 8) lines.push(`${who}: "Já chegou carta hoje? Eu fico olhando a caixa de correio."`);
  if (lvl === 0) lines.push(`${who}: "Minha cabana é pequena, mas é minha. Quem sabe um dia uma casa de madeira?"`);
  if (lvl === 1) lines.push(`${who}: "Gostei da casa de madeira! Dá para ouvir a chuva no telhado."`);
  if (lvl === 2) lines.push(`${who}: "Tijolinho por tijolinho, parece castelo!"`);
  if (lvl === 3) lines.push(`${who}: "Um sobrado! Eu tenho até escada. Venha tomar um chá!"`);
  if (lvl === 4) lines.push(`${who}: "Na varanda dá para tomar chá e ver a rua passar."`);
  if (lvl === 5) lines.push(`${who}: "Meu solar ficou pronto! Ainda tem lugar para mais uma visita."`);
  if (d === 0) lines.push(`${who}: "Tenho um cantinho vazio na frente. Será que cabe uma jardineira?"`);
  return lines[Math.floor(rng() * lines.length)]!;
}

// ----------------------------------------------------------------------------- bater na porta

export interface KnockResident {
  id: string;
  name: string;
  /** Está dentro de casa (dormindo) agora? Quem já está na Vila não precisa sair. */
  asleep: boolean;
}

export interface KnockResult {
  /** Quem sai de casa por causa da batida (vazio se ninguém estava dentro ou se todos recusaram). */
  wake: string[];
  /** Quem saiu de mau humor (sono pesado de madrugada): a Vila mostra 😠 em vez de 🥱. */
  grumpy: string[];
  /** Quem estava dormindo e mandou você embora ("me deixa dormir!"). Bater de novo aumenta a chance de abrirem. */
  refused: string[];
  text: string;
  /** Quanto tempo quem foi acordado fica de pé antes de poder voltar a dormir. */
  stayUpMs: number;
}

/** Por quanto tempo (tempo real) quem foi acordado pela batida fica de pé: 20 minutos. */
export const KNOCK_STAY_UP_MS = 20 * 60 * 1000;

const listNames = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`);

/** Madrugada: o sono mais pesado (23 h às 5 h). Nas pontas da noite o sono é leve. */
export const isDeepSleep = (hour: number): boolean => hour >= 23 || hour < 5;

/**
 * Chance de quem dorme abrir a porta: 45 % no sono pesado e 75 % no leve, mais 25 pontos a cada batida anterior na mesma
 * casa (na terceira seguida, ninguém aguenta mais e abre).
 */
export function knockOpenChance(hour: number, previousKnocks: number): number {
  return Math.min(1, (isDeepSleep(hour) ? 0.45 : 0.75) + 0.25 * Math.max(0, previousKnocks));
}

/**
 * O que acontece quando você bate na porta. Quem já está lá fora continua por lá. Quem está dentro dormindo pode sair
 * (de mau humor, se for de madrugada) ou mandar você embora: "me deixa dormir!". `previousKnocks` conta as batidas
 * anteriores nesta casa, e cada uma torna mais provável que abram.
 */
export function knockDoor(residents: readonly KnockResident[], hour: number, rng: Rng, previousKnocks = 0): KnockResult {
  const none = { wake: [], grumpy: [], refused: [], stayUpMs: 0 };
  if (residents.length === 0) return { ...none, text: 'Você bate... e nada. Ninguém mora aqui ainda.' };
  const inside = residents.filter((r) => r.asleep);
  if (inside.length === 0) {
    const who = listNames(residents.map((r) => r.name));
    return { ...none, text: `Toc, toc! Ninguém atende: ${who} ${residents.length > 1 ? 'já estão' : 'já está'} lá fora, passeando pela Vila. Procure por aí!` };
  }
  const deep = isDeepSleep(hour);
  const chance = knockOpenChance(hour, previousKnocks);
  const wake: string[] = [];
  const grumpy: string[] = [];
  const refused: string[] = [];
  const lines: string[] = [];
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  for (const r of inside) {
    if (rng() < chance) {
      wake.push(r.id);
      if (deep) grumpy.push(r.id);
      lines.push(
        deep
          ? pick([
              `${r.name}: "Hmm? Que horas são?... Ah, é você. Tá bom, já saí. Mas é bom ser importante!"`,
              `${r.name} abre a porta de touca de dormir, com cara de poucos amigos: "Aconteceu alguma coisa?"`,
              `${r.name}: "Eu estava sonhando com bolo! Tudo bem, estou de pé... bocejando."`,
            ])
          : pick([
              `${r.name} abre a porta bocejando: "Eu só estava cochilando, juro!"`,
              `${r.name} aparece ajeitando o cabelo: "Já estava saindo!"`,
              `${r.name} espia pela janela e sai logo em seguida: "Ah, visita! Vamos passear?"`,
            ]),
      );
    } else {
      refused.push(r.id);
      lines.push(
        pick([
          `${r.name}, de dentro de casa: "Zzz... me deixa dormir!"`,
          `${r.name}, abafado pela porta: "Volta amanhã... estou cansado demais."`,
          `${r.name}: "Shhh! Estou dormindo!"`,
          `${r.name}: "Só mais cinco minutinhos... vai embora!"`,
        ]),
      );
    }
  }
  let text = `Toc, toc! ${lines.join(' ')}`;
  if (refused.length > 0 && wake.length === 0) text += ' (Se insistir, quem sabe abrem.)';
  return { wake, grumpy, refused, text, stayUpMs: wake.length > 0 ? KNOCK_STAY_UP_MS : 0 };
}

// ----------------------------------------------------------------------------- dormir

/** O Pokémon está dormindo agora? Cada um tem sua hora de deitar (21 a 23 h) e de acordar (5 a 7 h). */
export function isAsleep(id: string, hour: number, nocturnal = false): boolean {
  // O tipo Dark é mais ativo à noite: descansa pela manhã e volta a circular a
  // partir do começo da tarde, sem depender de sorteio ou de um horário fixo
  // inventado para a espécie.
  if (nocturnal) return hour >= 6 && hour < 13;
  const h = hash(`sono:${id}`);
  if (h % 4 === 0) return hour >= 2 && hour < 8;
  const bed = 21 + (h % 3);
  const wake = 5 + (Math.floor(h / 7) % 3);
  return hour >= bed || hour < wake;
}

// ----------------------------------------------------------------------------- crescer com o nível

/** O que a cidade ganha ao ir do nível `from` ao nível `to` de Treinador (para o aviso de "a Vila cresceu"). */
export function unlockedBetween(from: number, to: number): { houses: number; buildings: string[]; stage: string | null } {
  let houses = 0;
  const buildings: string[] = [];
  for (const l of LOTS) if (l.unlock > from && l.unlock <= to) houses++;
  for (const b of [...CIVIC].sort((x, y) => x.unlock - y.unlock)) if (b.unlock > from && b.unlock <= to) buildings.push(b.name);
  const a = townStage(from);
  const b = townStage(to);
  return { houses, buildings, stage: b.index > a.index ? b.name : null };
}

/** O que vem no próximo nível que libera algo (para a dica da placa). */
export function nextUnlock(level: number): { level: number; text: string } | null {
  const levels = new Set<number>([...LOTS.map((l) => l.unlock), ...CIVIC.map((b) => b.unlock)]);
  const next = [...levels].filter((l) => l > level).sort((a, b) => a - b)[0];
  if (next === undefined) return null;
  const parts: string[] = [];
  const houses = LOTS.filter((l) => l.unlock === next).length;
  if (houses > 0) parts.push(houses === 1 ? 'um terreno novo' : `${houses} terrenos novos`);
  for (const b of CIVIC) if (b.unlock === next) parts.push(b.name);
  return { level: next, text: parts.join(' e ') };
}

// ----------------------------------------------------------------------------- prédios

const MAIL_ITEMS: ItemId[] = ['madeira', 'pedra', 'flor', 'concha', 'mel', 'pena'];
const LETTERS = [
  'Um cartão-postal de uma praia que ninguém sabe onde fica. No verso: "Saudades daí!"',
  'Uma carta do Conselho das Árvores: "Obrigado por cuidar da Vila."',
  'Um panfleto: "Grande feira de frutas no sábado! Traga o seu melhor arbusto."',
  'Um bilhete sem assinatura: "Alguém comeu a última baga. Não foi eu. — Assinado, um Pokémon."',
  'Um desenho de giz de cera: você e todos os Pokémon, de mãos dadas. Está no seu diário agora.',
  'Uma carta do Museu: "Continue colecionando! A parede ainda tem espaço."',
  'Um convite: "Piquenique no campo hoje à tarde. Leve guloseimas."',
  'Uma carta perfumada. Cheira a lavanda e a segredos de família.',
];

export function collectMail(s: VillageState, today: string, rng: Rng, names: Readonly<Record<string, string>>): Interaction {
  if (s.town.mailDay === today) return { ok: false, message: 'O carteiro disse: "Hoje a sua caixa já foi esvaziada. Volte amanhã!"' };
  s.town.mailDay = today;
  const coins = 8 + Math.floor(rng() * 23);
  s.coins += coins;
  let message: string;
  const last = s.lingo[s.lingo.length - 1];
  if (last && names[last.from] && rng() < 0.45) {
    message = `Uma carta de ${names[last.from]}: "Fiquei pensando em ${last.text}. Obrigado por conversar comigo!"`;
    const f = friendOf(s, last.from);
    f.points = Math.min(100, f.points + 2);
  } else message = LETTERS[Math.floor(rng() * LETTERS.length)]!;
  let extra = '';
  if (rng() < 0.5) {
    const item = MAIL_ITEMS[Math.floor(rng() * MAIL_ITEMS.length)]!;
    add(s, item, 1);
    extra = ` E mais: ${itemName(item)}.`;
  }
  return { ok: true, message: `📬 ${message} (+${coins} moedas)${extra}` };
}

export const CAFE_PRICE = 20;

/** Um lanche para você e os Pokémon que estão por perto: uma vez por dia, rende amizade. */
export function cafeVisit(s: VillageState, today: string, nearIds: readonly string[], names: Readonly<Record<string, string>>): Interaction {
  if (s.town.cafeDay === today) return { ok: false, message: 'Você já lanchou aqui hoje. A cozinheira piscou: "Amanhã tem bolo novo!"' };
  if (s.coins < CAFE_PRICE) return { ok: false, message: `O lanche custa ${CAFE_PRICE} moedas.` };
  s.coins -= CAFE_PRICE;
  s.town.cafeDay = today;
  const guests = nearIds.slice(0, 4);
  for (const id of guests) {
    const f = friendOf(s, id);
    f.points = Math.min(100, f.points + 3);
  }
  const who = guests.map((g) => names[g] ?? 'Pokémon');
  return { ok: true, message: who.length === 0 ? '☕ Você lanchou sozinho, olhando a rua. Chame alguém da próxima vez!' : `☕ Lanche com ${who.join(', ')}: todo mundo sorriu e ficou mais amigo!` };
}

// ----------------------------------------------------------------------------- mapa antigo

/**
 * Saves antigos podem ter móveis, plantações ou você mesmo onde agora há casa, prédio ou poste: móveis voltam para a mochila,
 * plantas são removidas e você volta ao começo da Vila.
 */
export function sanitizeTown(s: VillageState, map: VillageMap): number {
  let fixed = 0;
  const bad = (x: number, y: number) => isSolidTile(tileAt(map, x, y));
  for (let i = s.placed.length - 1; i >= 0; i--) {
    const f = s.placed[i]!;
    if (bad(f.x, f.y)) {
      add(s, f.item, 1);
      s.placed.splice(i, 1);
      fixed++;
    }
  }
  const before = s.crops.length;
  s.crops = s.crops.filter((c) => !bad(c.x, c.y));
  fixed += before - s.crops.length;
  // Móveis de antes que ficaram na frente de uma porta ou fecham um caminho voltam para a mochila (a horta fica).
  const taken = (x: number, y: number) => s.placed.some((f) => f.x === x && f.y === y) || s.crops.some((c) => c.x === x && c.y === y);
  for (let i = s.placed.length - 1; i >= 0; i--) {
    const f = s.placed[i]!;
    if (isFront(map, f.x, f.y)) {
      add(s, f.item, 1);
      s.placed.splice(i, 1);
      fixed++;
    }
  }
  while (s.placed.length > 0 && cutsOff(map, taken)) {
    // Tira primeiro o móvel que, sozinho, resolve; se nenhum resolve sozinho, o mais recente.
    let pick = s.placed.length - 1;
    for (let i = s.placed.length - 1; i >= 0; i--) {
      const f = s.placed[i]!;
      if (!cutsOff(map, (x, y) => taken(x, y) && !(x === f.x && y === f.y))) {
        pick = i;
        break;
      }
    }
    add(s, s.placed[pick]!.item, 1);
    s.placed.splice(pick, 1);
    fixed++;
  }
  if (bad(s.player.x, s.player.y)) {
    s.player.x = map.spawn.x;
    s.player.y = map.spawn.y;
    fixed++;
  }
  return fixed;
}


import type { Rng } from '../battle';
import { add, canAfford, friendOf, itemName, pay } from './life';
import type { Interaction, ItemId, VillageState } from './life';
import { isSolidTile, tileAt } from './map';
import type { VillageMap } from './map';
import { hash } from './personality';
import { LOTS, TOWN_STAGES, townStage } from './town-layout';
import type { Building } from './town-layout';

export { buildingAt } from './map';
export { LOTS, TOWN_STAGES, townStage };
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

/** Cada casa guarda um número só: nível (2 bits), enfeites (4 bits) e telhado (3 bits). */
export const homeLevel = (v: number): number => v & 3;
export const homeDecor = (v: number): number => (v >> 2) & 15;
export const homeRoof = (v: number): number => (v >> 6) & 7;
export const homeValue = (level: number, decor: number, roof: number): number => (level & 3) | ((decor & 15) << 2) | ((roof & 7) << 6);

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
  if (!next) return { ok: false, message: 'Esta casa já é um sobrado completo!' };
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
  if (d === 0) lines.push(`${who}: "Tenho um cantinho vazio na frente. Será que cabe uma jardineira?"`);
  return lines[Math.floor(rng() * lines.length)]!;
}

// ----------------------------------------------------------------------------- dormir

/** O Pokémon está dormindo agora? Cada um tem sua hora de deitar (21 a 23 h) e de acordar (5 a 7 h); alguns são notívagos. */
export function isAsleep(id: string, hour: number): boolean {
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
  for (const b of CIVIC_NAMES) if (b.unlock > from && b.unlock <= to) buildings.push(b.name);
  const a = townStage(from);
  const b = townStage(to);
  return { houses, buildings, stage: b.index > a.index ? b.name : null };
}

const CIVIC_NAMES = [
  { name: 'Café da Vila', unlock: 3 },
  { name: 'Correio', unlock: 5 },
  { name: 'Museu', unlock: 8 },
];

/** O que vem no próximo nível que libera algo (para a dica da placa). */
export function nextUnlock(level: number): { level: number; text: string } | null {
  const levels = new Set<number>([...LOTS.map((l) => l.unlock), ...CIVIC_NAMES.map((b) => b.unlock)]);
  const next = [...levels].filter((l) => l > level).sort((a, b) => a - b)[0];
  if (next === undefined) return null;
  const parts: string[] = [];
  const houses = LOTS.filter((l) => l.unlock === next).length;
  if (houses > 0) parts.push(houses === 1 ? 'um terreno novo' : `${houses} terrenos novos`);
  for (const b of CIVIC_NAMES) if (b.unlock === next) parts.push(b.name);
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
  if (bad(s.player.x, s.player.y)) {
    s.player.x = map.spawn.x;
    s.player.y = map.spawn.y;
    fixed++;
  }
  return fixed;
}


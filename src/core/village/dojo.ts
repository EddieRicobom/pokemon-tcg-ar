import { towerLoadout } from '../survivor-loadout';
import type { TowerLoadout } from '../survivor-loadout';
import { lunchEffectFor } from '../survivor-lunch';
import { add, availableCount, canAfford, count, describeCost, itemName, pay } from './life';
import type { Interaction, VillageState } from './life';
import { DOJO_LEVELS, LESSONS, TRAININGS } from './tower-state';
import type { LessonId, TrainingId } from './tower-state';
import { itemDef } from './catalog';
import { professionActive } from './professions';

/**
 * Compras e rotinas do Dojô da Torre, da sorte do Carteiro e da marmita do Café. Tudo é função pura sobre o
 * `VillageState` (a interface só chama e mostra a mensagem). Quem cuida do posto precisa estar ativo: sem o Instrutor
 * (população abaixo do mínimo) não dá para comprar, mas o que já foi comprado continua valendo.
 */

/** O posto do Dojô só abre com população suficiente; os treinos comprados valem mesmo com ele suspenso. */
export function dojoOpen(residents: number): boolean {
  return professionActive('dojo', residents);
}

const CLOSED = { ok: false, message: 'O Dojô está fechado: faltam moradores para o Instrutor assumir.' } as const;

export function nextDojoUpgrade(s: VillageState) {
  return DOJO_LEVELS[s.tower.dojoLevel] ?? null;
}

export function upgradeDojo(s: VillageState, open = true): Interaction {
  if (!open) return CLOSED;
  const next = nextDojoUpgrade(s);
  if (!next) return { ok: false, message: 'O Dojô já está no último nível.' };
  if (s.coins < next.coins) return { ok: false, message: `Faltam moedas: a reforma custa ${next.coins}.` };
  if (!canAfford(s, next.cost)) return { ok: false, message: `Faltam materiais: ${describeCost(s, next.cost)}.` };
  s.coins -= next.coins;
  pay(s, next.cost);
  s.tower.dojoLevel = next.level;
  return { ok: true, message: `${next.icon} ${next.name} pronto! O Instrutor ensina mais coisas agora.` };
}

export function trainingLevel(s: VillageState, id: TrainingId): number {
  return s.tower.training[id] ?? 0;
}

/** Por que o próximo nível de um treino não pode ser comprado; null quando pode. */
export function trainingBlock(s: VillageState, id: TrainingId): string | null {
  const def = TRAININGS[id];
  const level = trainingLevel(s, id);
  if (level >= def.coins.length) return 'Treino no nível máximo.';
  const need = def.minDojo[level]!;
  if (s.tower.dojoLevel < need) return `Exige ${DOJO_LEVELS[need - 1]!.name}.`;
  const coins = def.coins[level]!;
  if (s.coins < coins) return `Faltam moedas (${coins}).`;
  if (availableCount(s, def.piece) < 1) return `Falta: ${itemName(def.piece)}.`;
  return null;
}

export function buyTraining(s: VillageState, id: TrainingId, open = true): Interaction {
  if (!open) return CLOSED;
  const reason = trainingBlock(s, id);
  if (reason) return { ok: false, message: reason };
  const def = TRAININGS[id];
  const level = trainingLevel(s, id);
  s.coins -= def.coins[level]!;
  pay(s, { [def.piece]: 1 });
  s.tower.training[id] = level + 1;
  return { ok: true, message: `${def.icon} ${def.name} nível ${level + 1}: ${def.perLevel}.` };
}

export function lessonBlock(s: VillageState, id: LessonId): string | null {
  const def = LESSONS[id];
  if (s.tower.lessons.includes(id)) return 'Você já aprendeu esta lição.';
  if (def.requires && !s.tower.lessons.includes(def.requires)) return `Exige a lição ${LESSONS[def.requires].name}.`;
  if (s.tower.dojoLevel < def.minDojo) return `Exige ${DOJO_LEVELS[def.minDojo - 1]!.name}.`;
  if (s.coins < def.coins) return `Faltam moedas (${def.coins}).`;
  if (availableCount(s, def.piece) < def.pieces) return `Faltam: ${def.pieces}× ${itemName(def.piece)}.`;
  return null;
}

export function buyLesson(s: VillageState, id: LessonId, open = true): Interaction {
  if (!open) return CLOSED;
  const reason = lessonBlock(s, id);
  if (reason) return { ok: false, message: reason };
  const def = LESSONS[id];
  s.coins -= def.coins;
  pay(s, { [def.piece]: def.pieces });
  s.tower.lessons.push(id);
  return { ok: true, message: `${def.icon} Lição aprendida: ${def.name}.` };
}

/** Liga ou desliga um treino/lição já comprado (a corrida pura desliga tudo sem mexer nisto). */
export function toggleTowerOption(s: VillageState, id: string): boolean {
  const owned = (TRAININGS as Record<string, unknown>)[id] ? trainingLevel(s, id as TrainingId) > 0 : (s.tower.lessons as string[]).includes(id);
  if (!owned) return false;
  s.tower.disabled = s.tower.disabled.includes(id) ? s.tower.disabled.filter((x) => x !== id) : [...s.tower.disabled, id];
  return true;
}

// ----------------------------------------------------------------------------- sorte do Carteiro

/** Uma vez por dia: a carta da sorte dá 1 desejo de Jirachi extra só no começo da próxima corrida (não acumula). */
export function readLuckLetter(s: VillageState, today: string): Interaction {
  if (s.tower.luckDay === today) return { ok: false, message: 'O carteiro sorriu: "Hoje a sua sorte já foi entregue. Volte amanhã!"' };
  s.tower.luckDay = today;
  s.tower.luckPending = true;
  return { ok: true, message: '✉️ "A sorte está do seu lado." ⭐ Você começa a próxima corrida com 1 desejo de Jirachi.' };
}

// ----------------------------------------------------------------------------- marmita do Café

/** Quais comidas da mochila podem virar marmita: todas as que têm efeito (todas as receitas de comida têm). */
export function lunchChoices(s: VillageState): string[] {
  return Object.keys(s.inventory).filter((id) => itemDef(id)?.kind === 'food' && count(s, id) > 0 && lunchEffectFor(id) !== null);
}

/** Reserva uma comida como marmita; se já havia outra, ela volta para a mochila. Só uma por corrida. */
export function packLunch(s: VillageState, foodId: string, open = true): Interaction {
  if (!open) return { ok: false, message: 'O Café está fechado: faltam moradores para atender a cozinha.' };
  if (!lunchEffectFor(foodId)) return { ok: false, message: 'Isso não dá marmita.' };
  if (availableCount(s, foodId) < 1) return { ok: false, message: 'Você não tem essa comida.' };
  if (s.tower.lunchbox) add(s, s.tower.lunchbox, 1);
  pay(s, { [foodId]: 1 });
  s.tower.lunchbox = foodId;
  return { ok: true, message: `🍱 Marmita pronta: ${itemName(foodId)}. Vale para a próxima corrida.` };
}

export function unpackLunch(s: VillageState): Interaction {
  const food = s.tower.lunchbox;
  if (!food) return { ok: false, message: 'Nenhuma marmita guardada.' };
  add(s, food, 1);
  s.tower.lunchbox = null;
  return { ok: true, message: `${itemName(food)} voltou para a mochila.` };
}

// ----------------------------------------------------------------------------- uma corrida

export interface TowerRunStart {
  loadout: TowerLoadout;
}

/**
 * Monta o que a Vila entrega a uma corrida e consome a sorte do Carteiro (gasta ao começar, usando ou não). Na corrida
 * pura nada é consumido e nada entra. A marmita só é gasta/devolvida em `settleTowerRun`.
 */
export function startTowerRun(s: VillageState, options: { pure: boolean }): TowerRunStart {
  const lunch = !options.pure && s.tower.lunchbox ? lunchEffectFor(s.tower.lunchbox) : null;
  const luck = !options.pure && s.tower.luckPending;
  const loadout = towerLoadout(s.tower, { pure: options.pure, luck, lunch });
  if (luck) s.tower.luckPending = false;
  return { loadout };
}

/** Corrida que durou menos que isto não conta: a marmita volta para a mochila. */
export const TOWER_RUN_MIN_MS = 20_000;

/** Fim da corrida: a marmita é gasta se a corrida contou e devolvida se foi desistência logo no começo. */
export function settleTowerRun(s: VillageState, loadout: TowerLoadout, survivedMs: number): void {
  if (!loadout.lunch || s.tower.lunchbox !== loadout.lunch.foodId) return;
  if (survivedMs < TOWER_RUN_MIN_MS) add(s, s.tower.lunchbox, 1);
  s.tower.lunchbox = null;
}

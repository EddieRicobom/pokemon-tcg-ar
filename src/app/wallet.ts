import { ref } from 'vue';
import { loadVillage, saveVillage } from './village-store';
import type { VillageState } from '../core/village/life';
import { dayKey } from '../core/trainer';
import { legendaryEffects } from '../core/village/legendary';

/**
 * Moedas: o saldo ÚNICO do app (pedido do dono, 2026-10-16). Antes eram três — moedas da Vila, energia do Treinador
 * (Pins e forma Mega) e energia da Fonte (Digital Pokémon). Agora tudo ganha e gasta moedas, guardadas no mesmo lugar
 * de sempre (`VillageState.coins`, que já entra no backup). As energias antigas foram descartadas, por escolha do dono.
 *
 * A Vila, quando aberta, mantém o próprio estado na memória e salva de tempos em tempos: se a carteira escrevesse
 * direto no armazenamento nessa hora, a Vila sobrescreveria. Por isso a Vila aberta se registra aqui
 * (`attachLiveVillage`) e a carteira passa a mexer no estado vivo dela.
 */
let live: { state: VillageState; onChange: () => void } | null = null;

function storedCoins(): number {
  try {
    return loadVillage().coins;
  } catch {
    return 0;
  }
}

/** Saldo atual (reativo), para mostrar em qualquer tela. */
export const coins = ref<number>(storedCoins());

/** A Vila abriu: a carteira passa a usar o estado vivo dela (e `onChange` salva). */
export function attachLiveVillage(state: VillageState, onChange: () => void): void {
  live = { state, onChange };
  coins.value = state.coins;
}

/**
 * A Vila fechou: volta a ler e gravar no armazenamento. O saldo mostrado vem do estado vivo dela, não do
 * armazenamento — o último salvamento da Vila pode acontecer logo depois, e reler agora pegaria um valor velho.
 */
export function detachLiveVillage(state: VillageState): void {
  if (live?.state !== state) return;
  live = null;
  coins.value = state.coins;
}

/** A Vila mudou as moedas por conta própria (loja, pesca…): só atualiza o saldo mostrado. */
export function syncCoins(value: number): void {
  coins.value = value;
}

/** Aplica `fn` à Vila (viva ou guardada) e salva se `fn` disser que mudou. */
export function withVillage(fn: (state: VillageState) => boolean): boolean {
  if (live) {
    const changed = fn(live.state);
    if (changed) {
      live.onChange();
      coins.value = live.state.coins;
    }
    return changed;
  }
  const state = loadVillage();
  const changed = fn(state);
  if (changed) {
    if (!saveVillage(state)) return false;
    coins.value = state.coins;
  }
  return changed;
}

const MAX_COINS = 999999;

/** Multiplicador de moedas agora (Zapdos: +25% por 3 horas depois do encontro). */
export function coinMultiplierNow(state: VillageState, nowMs = Date.now()): number {
  return legendaryEffects(state.legendary, nowMs, dayKey(new Date(nowMs)), (ms) => dayKey(new Date(ms))).coinMultiplier;
}

/** Ganha moedas (valor inteiro positivo; o bônus de Zapdos, se ativo, entra aqui). Devolve quantas entraram. */
export function addCoins(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const base = Math.max(0, Math.floor(amount));
  if (base === 0) return 0;
  let added = 0;
  const changed = withVillage((state) => {
    const n = Math.round(base * coinMultiplierNow(state));
    const next = Math.min(MAX_COINS, state.coins + n);
    added = next - state.coins;
    state.coins = next;
    return added > 0;
  });
  return changed ? added : 0;
}

/** Gasta moedas. Devolve false (e não muda nada) se faltar saldo. */
export function spendCoins(amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const n = Math.max(0, Math.floor(amount));
  return withVillage((state) => {
    if (state.coins < n) return false;
    state.coins -= n;
    return true;
  });
}

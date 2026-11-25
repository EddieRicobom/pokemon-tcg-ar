/**
 * Preferências do aparelho para a Torre de Sobrevivência. Cada leitura é tolerante: sem armazenamento, JSON quebrado
 * ou valor fora do formato, volta ao padrão. As chaves antigas continuam iguais, para o save de quem já jogou valer.
 * Novas chaves só entram aqui, nunca espalhadas pela tela.
 */

export type SurvivorButtonSize = 'p' | 'm' | 'g';
export type SurvivorButtonLayout = 'lado' | 'pilha' | 'troca';
export type SurvivorHand = 'right' | 'left';

export interface SurvivorButtonPrefs {
  size: SurvivorButtonSize;
  layout: SurvivorButtonLayout;
  hand: SurvivorHand;
}

export const SURVIVOR_PREF_KEYS = {
  cinema: 'tcg-ar-torre-luz-v1',
  tips: 'tcg-ar-torre-tips-v1',
  adaptive: 'tcg-ar-survivor-adaptive-v1',
  pure: 'tcg-ar-survivor-pure-v1',
  buttons: 'tcg-ar-survivor-buttons-v1',
  haptics: 'tcg-ar-torre-haptics-v1',
  tutorial: 'tcg-ar-torre-tutorial-v1',
} as const;

/** Quantas dicas já vistas o save lembra (as mais antigas somem). */
export const SURVIVOR_TIPS_LIMIT = 20;

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: a escolha vale só nesta sessão.
  }
}

/** Luz cinematográfica; ligada por padrão. */
export function readSurvivorCinema(): boolean {
  return readRaw(SURVIVOR_PREF_KEYS.cinema) !== '0';
}

export function writeSurvivorCinema(value: boolean): void {
  writeRaw(SURVIVOR_PREF_KEYS.cinema, value ? '1' : '0');
}

/** Dicas contextuais já vistas, na ordem em que apareceram. */
export function readSurvivorTips(): string[] {
  const raw = readRaw(SURVIVOR_PREF_KEYS.tips);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique: string[] = [];
    for (const id of parsed) {
      if (typeof id !== 'string' || id.length === 0 || unique.includes(id)) continue;
      unique.push(id.slice(0, 40));
    }
    return unique.slice(-SURVIVOR_TIPS_LIMIT);
  } catch {
    return [];
  }
}

export function writeSurvivorTips(ids: Iterable<string>): void {
  writeRaw(SURVIVOR_PREF_KEYS.tips, JSON.stringify([...ids].slice(-SURVIVOR_TIPS_LIMIT)));
}

/** Desafio adaptável; ligado por padrão. */
export function readSurvivorAdaptive(): boolean {
  return readRaw(SURVIVOR_PREF_KEYS.adaptive) !== '0';
}

export function writeSurvivorAdaptive(value: boolean): void {
  writeRaw(SURVIVOR_PREF_KEYS.adaptive, value ? '1' : '0');
}

/** Corrida pura (sem Dojô, sorte nem marmita); desligada por padrão. */
export function readSurvivorPure(): boolean {
  return readRaw(SURVIVOR_PREF_KEYS.pure) === '1';
}

export function writeSurvivorPure(value: boolean): void {
  writeRaw(SURVIVOR_PREF_KEYS.pure, value ? '1' : '0');
}

/** Tamanho, posição e mão dos botões Pular/Especial/Supremo. */
export function readSurvivorButtons(): SurvivorButtonPrefs {
  const raw = readRaw(SURVIVOR_PREF_KEYS.buttons);
  if (!raw) return { size: 'm', layout: 'lado', hand: 'right' };
  try {
    const parsed = JSON.parse(raw) as { size?: unknown; layout?: unknown; hand?: unknown } | null;
    return {
      size: parsed?.size === 'p' || parsed?.size === 'g' ? parsed.size : 'm',
      layout: parsed?.layout === 'pilha' || parsed?.layout === 'troca' ? parsed.layout : 'lado',
      hand: parsed?.hand === 'left' ? 'left' : 'right',
    };
  } catch {
    return { size: 'm', layout: 'lado', hand: 'right' };
  }
}

export function writeSurvivorButtons(prefs: SurvivorButtonPrefs): void {
  const safe: SurvivorButtonPrefs = {
    size: prefs.size === 'p' || prefs.size === 'g' ? prefs.size : 'm',
    layout: prefs.layout === 'pilha' || prefs.layout === 'troca' ? prefs.layout : 'lado',
    hand: prefs.hand === 'left' ? 'left' : 'right',
  };
  writeRaw(SURVIVOR_PREF_KEYS.buttons, JSON.stringify(safe));
}

/** Vibração da Torre (só onde o navegador permite); ligada por padrão. */
export function readSurvivorHaptics(): boolean {
  return readRaw(SURVIVOR_PREF_KEYS.haptics) !== '0';
}

export function writeSurvivorHaptics(value: boolean): void {
  writeRaw(SURVIVOR_PREF_KEYS.haptics, value ? '1' : '0');
}

/** O cartão "Como jogar" já foi dispensado uma vez. */
export function readSurvivorTutorialSeen(): boolean {
  return readRaw(SURVIVOR_PREF_KEYS.tutorial) === '1';
}

export function writeSurvivorTutorialSeen(value: boolean): void {
  writeRaw(SURVIVOR_PREF_KEYS.tutorial, value ? '1' : '0');
}

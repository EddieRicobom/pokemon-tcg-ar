import type { VillageState } from './life';
import { legendaryOf } from './legendary';

export interface RecapScene { title: string; text: string; cast: string[] }

/** Usa exclusivamente registros reais; nenhuma intriga ou consequência é inventada. */
export function dailyRecap(state: VillageState, since: number, now: number): RecapScene[] {
  const moments = state.diary.filter((m) => m.t > since && m.t <= now).slice(-3);
  // Diário vazio: é a primeira visita, não há "capítulos anteriores" para lembrar.
  const opening = state.diary.length === 0
    ? { title: 'Começa a sua história', text: 'Esta é a primeira página do Diário da Vila. Tudo o que acontecer por aqui fica guardado nele, e na próxima visita você revê os destaques.', cast: [] }
    : { title: 'Nos capítulos anteriores…', text: moments.length ? 'A Vila continuou sua história. Entre encontros e reviravoltas, estes foram os últimos acontecimentos…' : 'O dia abre um novo capítulo. Ainda não há acontecimentos novos no Diário: a próxima história começa com você.', cast: [] };
  return [
    opening,
    ...moments.map((m) => ({ title: m.title, text: [...m.lines.map((l) => l.text), ...m.result].join('\n\n'), cast: m.cast.map((c) => c.name) })),
    ...state.legendary.history.filter((e) => Date.parse(e.at) > since && Date.parse(e.at) <= now).slice(-1).flatMap((e) => {
      const def = legendaryOf(e.id);
      return def ? [{ title: `Uma visita de ${def.name}`, text: def.lines.join('\n\n'), cast: [def.name] }] : [];
    }),
    { title: 'E no capítulo de hoje…', text: 'Quem você vai encontrar pelo caminho? Explore a Vila. As memórias ficam no Diário, disponível no menu.', cast: [] },
  ];
}

export function needsDailyRecap(lastDay: string, today: string): boolean {
  return lastDay !== today;
}

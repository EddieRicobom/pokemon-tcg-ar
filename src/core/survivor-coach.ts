import type { SurvivorSummary } from './survivor-types';

/**
 * Dicas curtas para a próxima corrida, escolhidas a partir do que realmente aconteceu no fim da anterior. É só texto
 * e nunca altera a corrida, as recompensas ou o save. A função é pura e determinística para o resumo não mudar sozinho.
 */

export interface SurvivorCoachContext {
  /** Melhor tempo antes desta corrida, para mostrar o quanto faltou. */
  bestMs?: number;
  /** `false` quando a corrida não usou nenhum treino/lição da Vila. */
  trained?: boolean;
}

export interface SurvivorCoachHint {
  id: string;
  icon: string;
  text: string;
}

/** Recordes pessoais antes da corrida; zero significa que ainda não havia registro. */
export interface SurvivorBestBefore {
  ms: number;
  wave: number;
  level: number;
}

export interface SurvivorNewRecord {
  id: 'tempo' | 'onda' | 'nivel';
  from: number;
  to: number;
}

/** Recordes batidos nesta corrida, na ordem em que o resumo mostra. */
export function survivorNewRecords(
  summary: Pick<SurvivorSummary, 'survivedMs' | 'wave' | 'level'>,
  before: SurvivorBestBefore,
): SurvivorNewRecord[] {
  const records: SurvivorNewRecord[] = [];
  if (before.ms > 0 && summary.survivedMs > before.ms) records.push({ id: 'tempo', from: before.ms, to: summary.survivedMs });
  if (before.wave > 0 && summary.wave > before.wave) records.push({ id: 'onda', from: before.wave, to: summary.wave });
  if (before.level > 0 && summary.level > before.level) records.push({ id: 'nivel', from: before.level, to: summary.level });
  return records;
}

/**
 * Uma frase objetiva de "por que a corrida acabou": golpe final, vida antes e a fonte de dano
 * dominante. Complementa as dicas sem repetir o gráfico.
 */
export function survivorDeathNote(summary: SurvivorSummary): string | null {
  const final = summary.finalHit;
  if (!final) return null;
  const source = final.shadowBoss ? 'lendário sombrio'
    : final.boss || final.grade === 'chefao' ? 'chefão'
      : final.grade === 'elite' ? 'elite'
        : 'inimigo comum';
  const hp = Math.max(0, Math.round(final.hpBefore));
  const damage = Math.max(0, Math.round(final.damage));
  let note = `Você tinha ${hp} de vida e levou ${damage} de ${final.kind} do ${source}.`;
  const taken = summary.damageTaken ?? [];
  const total = taken.reduce((sum, row) => sum + row.damage, 0);
  const top = taken[0];
  if (top && total > 0) {
    const share = Math.round((top.damage / total) * 100);
    if (share >= 35) note += ` ${share}% do dano da corrida veio de ${top.name.toLocaleLowerCase('pt-BR')}.`;
  }
  return note;
}

const MAX_HINTS = 3;

export function survivorCoachHints(summary: SurvivorSummary, context: SurvivorCoachContext = {}): SurvivorCoachHint[] {
  const hints: SurvivorCoachHint[] = [];
  const final = summary.finalHit;

  if (summary.survivedMs < 60_000) {
    hints.push({ id: 'primeiro-minuto', icon: '🏃', text: 'No primeiro minuto, ande em círculos e colete orbes: subir de nível cedo vale mais que caçar inimigos.' });
  }

  if (final && (final.boss || final.grade === 'chefao' || final.shadowBoss)) {
    hints.push({ id: 'chefe', icon: '👑', text: 'Guarde o especial e o Golpe Supremo para o chefe; a barra no alto do HUD mostra a vida dele.' });
  } else if (final?.grade === 'elite') {
    hints.push({ id: 'elite', icon: '◆', text: 'Elites de treinador batem mais forte: limpe os comuns ao redor antes de encará-los de frente.' });
  } else if (final?.kind === 'projétil') {
    hints.push({ id: 'projetil', icon: '➤', text: 'Projéteis vêm em linha reta: troque de direção quando eles saírem, em vez de correr em linha.' });
  }

  const taken = summary.damageTaken?.[0];
  const takenTotal = summary.damageTaken?.reduce((sum, row) => sum + row.damage, 0) ?? 0;
  if (taken && takenTotal > 0 && taken.damage / takenTotal >= 0.35) {
    const text = taken.kind === 'projétil'
      ? 'A maior parte do dano veio de tiros: ande em diagonal e mude de direção assim que eles saírem.'
      : taken.kind === 'contato'
        ? 'Contato foi o maior dano: não deixe o cerco fechar; ande em círculos e guarde o especial para abrir espaço.'
        : taken.kind === 'explosão'
          ? 'Explosões dominaram: derrube os explosivos de longe e saia das áreas marcadas antes de atacar.'
          : 'A queimadura acumulou: quando o ícone 🔥 aparecer, evite apanhar de novo até o efeito esfriar.';
    hints.push({ id: 'dano-recebido', icon: '🩹', text });
  }

  if (context.bestMs && context.bestMs > 0 && summary.survivedMs < context.bestMs && context.bestMs - summary.survivedMs <= 15_000) {
    const seconds = Math.ceil((context.bestMs - summary.survivedMs) / 1000);
    hints.push({ id: 'recorde', icon: '⏱', text: `Faltaram ${seconds} s para o seu recorde. Segure o especial para a próxima onda e tente de novo.` });
  }

  if (context.trained === false) {
    hints.push({ id: 'dojo', icon: '🥋', text: 'O Dojô da Vila dá vida, defesa e desejos permanentes. Um treino antes da próxima corrida muda o começo.' });
  }

  if (summary.survivedMs >= 60_000 && summary.kills < Math.max(12, summary.level * 3)) {
    hints.push({ id: 'abates', icon: '🎯', text: 'Poucos abates para o nível alcançado: use o alvo automático Fraco ou Cura e passe por grupos em vez de evitá-los.' });
  }

  if (summary.trainersBeaten === 0 && summary.survivedMs >= 180_000) {
    hints.push({ id: 'treinador', icon: '🚩', text: 'O Perigo digital chama treinadores. Encare um com a vida cheia e o especial pronto para ganhar artefatos.' });
  }

  if (summary.infinite && summary.survivedMs >= 300_000) {
    hints.push({ id: 'infinito', icon: '∞', text: 'No infinito, o dano dos inimigos cresce a cada volta: priorize defesa e cura antes de empilhar dano.' });
  }

  if (hints.length === 0) {
    hints.push({ id: 'build', icon: '🃏', text: 'Você já sustenta bem a corrida. Experimente uma build de um golpe só ou uma raridade que ainda não escolheu.' });
  }
  return hints.slice(0, MAX_HINTS);
}

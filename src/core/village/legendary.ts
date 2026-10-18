import type { Rng } from '../battle';
import type { Moment } from './social-state';

/**
 * Encontros lendários raríssimos na Vila. Uma "oportunidade de sorteio" é a primeira vez que você abre a Vila em
 * cada dia do calendário do aparelho (nunca mais de uma por dia, nunca a cada abrir/fechar) — por isso o estado
 * guarda `lastRollDay`, não um relógio. Chance-base de 0,1% por oportunidade (`BASE_CHANCE`), com peso por
 * lendário. Arquitetura extensível: cada lendário é uma entrada de dados em `LEGENDARIES` (sprite real por dexId,
 * efeito, bônus, consequência, falas) — adicionar um novo é só acrescentar uma entrada, sem mexer no motor.
 * Função pura, sem UI — a cutscene fica em `VillageView.vue`.
 */

export type LegendaryEffectKind = 'clima' | 'tempo' | 'tempestade';

export interface LegendaryDef {
  id: string;
  /** Número real da Pokédex (nunca inventado). */
  dexId: number;
  name: string;
  /** Peso relativo no sorteio entre os lendários elegíveis (não afeta a chance-base de aparecer). */
  weight: number;
  effect: LegendaryEffectKind;
  /** Falas curtas da cutscene, nessa ordem. */
  lines: readonly string[];
  /** O que a aparição traz de bom (efeito temporário/registro). */
  boon: string;
  /** O lado difícil/estranho da aparição (nunca apaga progresso). */
  consequence: string;
  /** Efeitos válidos até o fim do dia, combinados sem acumular multiplicadores. */
  modifiers?: Partial<LegendaryEffects>;
}

export const LEGENDARIES: readonly LegendaryDef[] = [
  {
    id: 'suicune',
    dexId: 245,
    name: 'Suicune',
    weight: 1,
    effect: 'clima',
    lines: [
      'O vento para. A praça fica em silêncio.',
      'Da direção do lago, uma silhueta azul atravessa a água sem fazer uma onda.',
      'Suicune te encara por um instante — e some na chuva que começa a cair.',
    ],
    boon: 'Chuva calma cai sobre a Vila pelo resto do dia: a horta cresce mais rápido (cada estágio pede menos tempo depois da rega).',
    consequence: 'Os Pokémon ficam mais quietos hoje, meio encantados — os momentos entre eles acontecem com metade da frequência.',
  },
  {
    id: 'zapdos',
    dexId: 145,
    name: 'Zapdos',
    weight: 1,
    effect: 'tempestade',
    lines: [
      'O céu escurece de repente, mesmo sem nuvem nenhuma.',
      'Um raio corta o ar e, no clarão, uma ave elétrica gigante sobrevoa a praça.',
      'Zapdos solta um grito que ecoa — e desaparece entre relâmpagos.',
    ],
    boon: 'O ar da Vila fica "carregado": por 3 horas, as moedas ganhas (conversas, jogos, XP) rendem 25% a mais.',
    consequence: 'Os postes da cidade piscam a noite toda — nada grave, só um susto a cada tanto.',
  },
  {
    id: 'celebi',
    dexId: 251,
    name: 'Celebi',
    weight: 1,
    effect: 'tempo',
    lines: [
      'Por um segundo, tudo ao redor parece "tremer", como um quadro atrasando.',
      'Uma luz verde gira entre as árvores da praça, deixando rastros de folhas no ar.',
      'Celebi aparece, observa a Vila crescer com curiosidade — e volta a sumir no tempo.',
    ],
    boon: 'Um lampejo do futuro: o Diário ganha uma página especial, só desse dia.',
    consequence: 'Pelo resto do dia, o tempo na Vila parece "pular" — as animações dos Pokémon ficam mais rápidas.',
  },
  { id: "articuno", dexId: 144, name: "Articuno", weight: 1, effect: "clima",
    lines: ["Uma brisa gelada fecha as janelas da praça.", "Articuno pousa junto ao lago; o reflexo azul faz todos prenderem a respiração.", "Uma pena de gelo derrete antes que alguém consiga guardá-la."],
    boon: "A horta pede 20% menos tempo após a rega hoje.",
    consequence: "Encantados com a visita, os moradores vivem momentos 20% menos frequentes hoje.",
    modifiers: { growthFactor: 0.8, quietFactor: 1.2 },
  },
  { id: "moltres", dexId: 146, name: "Moltres", weight: 1, effect: "tempestade",
    lines: ["O horizonte ganha um brilho de brasa.", "Moltres cruza os telhados e a praça parece um palco ao pôr do sol.", "A última centelha some no céu, deixando um silêncio desconcertante."],
    boon: "As moedas recebidas rendem 15% a mais até o fim do dia.",
    consequence: "A agitação acelera as animações dos moradores em 10% hoje.",
    modifiers: { coinMultiplier: 1.15, animSpeed: 1.1 },
  },
  { id: "raikou", dexId: 243, name: "Raikou", weight: 1, effect: "tempestade",
    lines: ["Um trovão interrompe uma conversa no meio da frase.", "Raikou atravessa a praça: por um instante, ninguém lembra o que ia dizer.", "Ele desaparece na estrada, deixando o ar carregado."],
    boon: "Ganhos de moedas aumentam 20% hoje.",
    consequence: "Os postes piscam durante a noite de hoje.",
    modifiers: { coinMultiplier: 1.2, lampStorm: true },
  },
  { id: "entei", dexId: 244, name: "Entei", weight: 1, effect: "clima",
    lines: ["O chão parece suspirar sob os passos da Vila.", "Entei surge na estrada e observa as casas como quem reconhece um antigo lar.", "Um rugido distante encerra a visita antes de qualquer despedida."],
    boon: "O calor reduz em 15% o tempo da horta após a rega hoje.",
    consequence: "Os moradores ficam contemplativos: momentos 30% menos frequentes hoje.",
    modifiers: { growthFactor: 0.85, quietFactor: 1.3 },
  },
  { id: "lugia", dexId: 249, name: "Lugia", weight: 1, effect: "clima",
    lines: ["Uma sombra enorme passa sobre o lago.", "Lugia emerge entre nuvens baixas; a praça inteira para para olhar.", "Uma rajada leva as nuvens embora e a água volta a se fechar."],
    boon: "A chuva ajuda a horta: 25% menos tempo após a rega hoje.",
    consequence: "A chuva permanece hoje; os momentos ficam 40% menos frequentes.",
    modifiers: { rain: true, growthFactor: 0.75, quietFactor: 1.4 },
  },
  { id: "ho-oh", dexId: 250, name: "Ho-Oh", weight: 1, effect: "tempo",
    lines: ["Um arco colorido aparece sobre os telhados.", "Ho-Oh cruza o arco; até a conversa mais urgente perde a vez.", "O céu fecha suas cores, mas a lembrança fica."],
    boon: "As moedas recebidas rendem 30% a mais hoje.",
    consequence: "Os moradores se distraem com o céu: momentos 25% menos frequentes hoje.",
    modifiers: { coinMultiplier: 1.3, quietFactor: 1.25 },
  },
  { id: "regirock", dexId: 377, name: "Regirock", weight: 1, effect: "tempo",
    lines: ["Pequenas pedras tremem na beira do caminho.", "Regirock se ergue junto à praça, imóvel como uma promessa antiga.", "Quando a poeira baixa, o visitante já seguiu viagem."],
    boon: "As moedas recebidas rendem 10% a mais hoje.",
    consequence: "O ritmo das animações fica 15% mais lento hoje.",
    modifiers: { coinMultiplier: 1.1, animSpeed: 0.85 },
  },
  { id: "regice", dexId: 378, name: "Regice", weight: 1, effect: "clima",
    lines: ["O ar junto à Fonte fica frio de repente.", "Regice reflete cada telhado em seu corpo de gelo, como memórias em um espelho.", "A névoa se desfaz antes que alguém faça uma pergunta."],
    boon: "A horta pede 10% menos tempo após a rega hoje.",
    consequence: "O frio desacelera as animações em 20% hoje.",
    modifiers: { growthFactor: 0.9, animSpeed: 0.8 },
  },
  { id: "registeel", dexId: 379, name: "Registeel", weight: 1, effect: "tempestade",
    lines: ["Um som metálico ressoa entre as casas.", "Registeel toca a borda da Fonte; o eco atravessa a praça vazia de palavras.", "O som cessa e ninguém sabe ao certo como se despedir."],
    boon: "As moedas recebidas rendem 18% a mais hoje.",
    consequence: "A ressonância faz os postes piscarem esta noite.",
    modifiers: { coinMultiplier: 1.18, lampStorm: true },
  },
  { id: "rayquaza", dexId: 384, name: "Rayquaza", weight: 1, effect: "tempo",
    lines: ["As nuvens se abrem numa longa espiral.", "Rayquaza serpenteia muito acima da praça; todos erguem o olhar ao mesmo tempo.", "O céu se fecha como uma cortina no fim do ato."],
    boon: "As moedas recebidas rendem 25% a mais até o fim do dia.",
    consequence: "A euforia acelera as animações em 20% hoje.",
    modifiers: { coinMultiplier: 1.25, animSpeed: 1.2 },
  },
];

/** Chance-base por oportunidade de sorteio (0,1%). Ajustável depois de testes de balanceamento. */
export const BASE_CHANCE = 0.001;
/** Quantos encontros o histórico guarda (os mais antigos somem; não afeta o sorteio). */
const HISTORY_MAX = 20;

export interface LegendaryEncounter {
  id: string;
  /** ISO. */
  at: string;
}

export interface LegendaryState {
  history: LegendaryEncounter[];
  /** Quantas oportunidades de sorteio já aconteceram (mesmo as que não deram nada) — não reseta. */
  attempts: number;
  /** Dia (YYYY-MM-DD) do último sorteio feito, pra nunca sortear duas vezes no mesmo dia. */
  lastRollDay: string;
  /** Lendário aparecendo agora, até o jogador ver a cutscene (ver `VillageView.vue`). */
  active: { id: string } | null;
}

export function emptyLegendary(): LegendaryState {
  return { history: [], attempts: 0, lastRollDay: '', active: null };
}

export function normalizeLegendary(raw: unknown): LegendaryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LegendaryState>;
  const ids = new Set(LEGENDARIES.map((l) => l.id));
  return {
    history: Array.isArray(r.history) ? r.history.filter((e): e is LegendaryEncounter => !!e && typeof e.id === 'string' && typeof e.at === 'string').slice(-HISTORY_MAX) : [],
    attempts: typeof r.attempts === 'number' && r.attempts >= 0 ? Math.floor(r.attempts) : 0,
    lastRollDay: typeof r.lastRollDay === 'string' ? r.lastRollDay : '',
    active: r.active && typeof r.active === 'object' && typeof r.active.id === 'string' && ids.has(r.active.id) ? { id: r.active.id } : null,
  };
}

export function legendaryOf(id: string): LegendaryDef | undefined {
  return LEGENDARIES.find((l) => l.id === id);
}

export interface RollResult {
  state: LegendaryState;
  legendary: LegendaryDef | null;
}

/**
 * Uma oportunidade de sorteio (no máximo uma por `day`, veja o comentário do arquivo). Se já rolou hoje ou se um
 * encontro já está ativo esperando o jogador ver a cutscene, não sorteia de novo (evita manipular reabrindo a Vila).
 */
export function rollLegendary(s: LegendaryState, rng: Rng, day: string, now: string): RollResult {
  if (s.lastRollDay === day || s.active) return { state: s, legendary: null };
  const attempts = s.attempts + 1;
  const base: LegendaryState = { ...s, attempts, lastRollDay: day };
  if (rng() >= BASE_CHANCE) return { state: base, legendary: null };
  const totalWeight = LEGENDARIES.reduce((sum, l) => sum + l.weight, 0);
  let roll = rng() * totalWeight;
  let chosen = LEGENDARIES[0]!;
  for (const l of LEGENDARIES) {
    if (roll < l.weight) {
      chosen = l;
      break;
    }
    roll -= l.weight;
  }
  const history = [...s.history, { id: chosen.id, at: now }].slice(-HISTORY_MAX);
  return { state: { ...base, history, active: { id: chosen.id } }, legendary: chosen };
}

/** Fecha a cutscene ativa (o jogador já viu); o encontro já ficou registrado no histórico ao sortear. */
export function dismissActive(s: LegendaryState): LegendaryState {
  return s.active ? { ...s, active: null } : s;
}

/**
 * O que os encontros de verdade mudam na Vila (antes as cutscenes só PROMETIAM — nenhum código aplicava). Vale a
 * partir do encontro registrado no histórico: Suicune e Celebi pelo resto daquele dia (do calendário do aparelho),
 * o bônus de moedas de Zapdos por `ZAPDOS_BOOST_HOURS` horas e as luzes dele também naquele dia.
 */
export const SUICUNE_GROWTH_FACTOR = 0.6;
export const SUICUNE_QUIET_FACTOR = 2;
export const ZAPDOS_COIN_MULTIPLIER = 1.25;
export const ZAPDOS_BOOST_HOURS = 3;
export const CELEBI_ANIM_SPEED = 1.3;

export interface LegendaryEffects {
  /** Suicune: chuva fixa na Vila. */
  rain: boolean;
  /** Fração do tempo de rega que cada estágio da horta precisa (1 = normal). */
  growthFactor: number;
  /** Multiplicador do intervalo entre momentos dos Pokémon (1 = normal). */
  quietFactor: number;
  /** Multiplicador das moedas ganhas (1 = normal). */
  coinMultiplier: number;
  /** Zapdos: postes piscando à noite. */
  lampStorm: boolean;
  /** Velocidade das animações dos Pokémon (1 = normal). */
  animSpeed: number;
}

export const NO_EFFECTS: LegendaryEffects = { rain: false, growthFactor: 1, quietFactor: 1, coinMultiplier: 1, lampStorm: false, animSpeed: 1 };

/** `dayOf` diz o dia (AAAA-MM-DD, calendário do aparelho) de um instante — injetado para os testes não dependerem do fuso. */
export function legendaryEffects(s: LegendaryState, nowMs: number, today: string, dayOf: (ms: number) => string): LegendaryEffects {
  const out: LegendaryEffects = { ...NO_EFFECTS };
  for (const e of s.history) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at) || at > nowMs) continue;
    const sameDay = dayOf(at) === today;
    const modifiers = legendaryOf(e.id)?.modifiers;
    if (sameDay && modifiers) {
      out.rain ||= modifiers.rain ?? false;
      out.lampStorm ||= modifiers.lampStorm ?? false;
      out.growthFactor = Math.min(out.growthFactor, modifiers.growthFactor ?? 1);
      out.quietFactor = Math.max(out.quietFactor, modifiers.quietFactor ?? 1);
      out.coinMultiplier = Math.max(out.coinMultiplier, modifiers.coinMultiplier ?? 1);
      if (modifiers.animSpeed !== undefined) out.animSpeed = modifiers.animSpeed;
    }
    if (e.id === 'suicune' && sameDay) {
      out.rain = true;
      out.growthFactor = SUICUNE_GROWTH_FACTOR;
      out.quietFactor = SUICUNE_QUIET_FACTOR;
    } else if (e.id === 'zapdos') {
      if (nowMs - at < ZAPDOS_BOOST_HOURS * 3_600_000) out.coinMultiplier = ZAPDOS_COIN_MULTIPLIER;
      if (sameDay) out.lampStorm = true;
    } else if (e.id === 'celebi' && sameDay) {
      out.animSpeed = CELEBI_ANIM_SPEED;
    }
  }
  return out;
}

/** A página especial que Celebi deixa no Diário (um momento só daquele dia, guardado no Álbum). */
export function celebiDiaryPage(atMs: number, day: string, hour: number): Moment {
  return {
    id: `celebi-${atMs.toString(36)}`,
    t: atMs,
    day,
    hour,
    tpl: 'lendario-celebi',
    kind: 'solo',
    title: 'Uma página do futuro',
    emoji: '🍃',
    cast: [{ id: 'lendario-celebi', name: 'Celebi' }],
    lines: [
      { who: 0, text: 'Uma folha verde caiu no Diário e, por um segundo, a página mostrou a Vila maior, cheia de luzes.' },
      { who: 0, text: 'Quando você piscou, o desenho já tinha virado só uma folha seca, marcando esta data.' },
    ],
    result: ['página especial de Celebi'],
    fav: true,
  };
}

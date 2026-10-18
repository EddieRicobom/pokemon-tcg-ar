import type { Template } from './kit';
import { L, wearing } from './kit';

/** Moradores reparam nos móveis colocados e nos acessórios usados. */
export const NOTICE_MOMENTS: readonly Template[] = [
  { id: 'notice-radio', kind: 'solo', title: 'A música nova', emoji: '📻', cast: 1, weight: 2, when: (c) => c.has('radio'), lines: (c) => [L(0, `${c.n[0]} para diante do rádio: “Essa música combina com a Vila inteira.”`)], outcome: { coins: 4 }, after: () => 'Ainda estou escolhendo a próxima música.' },
  { id: 'notice-piano', kind: 'solo', title: 'Uma nota no piano', emoji: '🎹', cast: 1, weight: 1, when: (c) => c.has('piano'), lines: (c) => [L(0, `${c.n[0]} toca uma nota no piano e escuta o eco pela casa.`)], outcome: { friend: 1, coins: 3 } },
  { id: 'notice-lantern', kind: 'solo', title: 'Luz no caminho', emoji: '🏮', cast: 1, weight: 2, when: (c) => c.has('lanterna') || c.has('abobora-lanterna'), lines: (c) => [L(0, `${c.n[0]} acha as lanternas lindas e fica mais tempo passeando por perto.`)], outcome: { friend: 2 } },
  { id: 'notice-tent', kind: 'solo', title: 'Acampamento improvisado', emoji: '⛺', cast: 1, weight: 1, when: (c) => c.has('tenda'), lines: (c) => [L(0, `${c.n[0]} investiga a tenda: “Será que cabe mais alguém aqui?”`)], outcome: { coins: 5 } },
  { id: 'notice-hat', kind: 'solo', title: 'O acessório novo', emoji: '🎩', cast: 1, weight: 2, when: (c) => c.env.worn === undefined || wearing(c, 'chapeu-palha', 'bone', 'laco', 'coroa-flores', 'chapeu-festa', 'chapeu-cowboy'), lines: (c) => [L(0, `${c.n[0]} percebe seu acessório e tenta imitar a pose.`)], outcome: { friend: 2 } },
  { id: 'notice-glasses', kind: 'solo', title: 'Olhar diferente', emoji: '🕶️', cast: 1, weight: 2, when: (c) => c.env.worn === undefined || wearing(c, 'oculos', 'oculos-redondos', 'oculos-estrela'), lines: (c) => [L(0, `${c.n[0]} comenta os óculos: “Agora você parece pronto para uma aventura.”`)], outcome: { coins: 3 } },
];

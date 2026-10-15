import { friendLevel, friendOf } from './life';
import type { Interaction, VillageState } from './life';
import { cleanAnswer, MAX_NICK_LEN, MAX_NICKS } from './social-state';

/**
 * Apelidos: quem chegou a «Grande amigo» (nível 3 de amizade na Vila) aceita um apelido que você escolhe. O apelido vale
 * onde o Pokémon aparece (Vila, Livro, Caixa e batalhas) e a carta continua com o nome de verdade.
 */
export const NICK_MIN_LEVEL = 3;
export { MAX_NICK_LEN };

/** Ideias para quem não sabe o que escolher (aparecem como sugestões ao dar o apelido). */
export const NICK_IDEAS: readonly string[] = ['Chefe', 'Docinho', 'Pipoca', 'Fofo', 'Trovão', 'Pequeno', 'Mestre', 'Estrela', 'Bolinha', 'Campeão', 'Fofinho', 'Brigadeiro'];

export const canNickname = (s: VillageState, id: string): boolean => friendLevel(friendOf(s, id).points).level >= NICK_MIN_LEVEL;

/** O apelido de hoje, ou '' se não tem. */
export const nicknameOf = (s: Pick<VillageState, 'nicks'>, id: string): string => s.nicks[id] ?? '';

/** Como o Pokémon aparece na tela: o apelido, se tem; senão o nome. */
export const displayName = (s: Pick<VillageState, 'nicks'>, id: string, realName: string): string => nicknameOf(s, id) || realName;

/** Três ideias de apelido para este Pokémon, sempre as mesmas para ele (e que ele ainda não usa). */
export function nickIdeas(s: Pick<VillageState, 'nicks'>, id: string): string[] {
  const used = new Set(Object.values(s.nicks).map((n) => n.toLowerCase()));
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const out: string[] = [];
  for (let k = 0; k < NICK_IDEAS.length && out.length < 3; k++) {
    const idea = NICK_IDEAS[(h + k * 5) % NICK_IDEAS.length]!;
    if (!used.has(idea.toLowerCase()) && !out.includes(idea)) out.push(idea);
  }
  return out;
}

/**
 * Dá (ou tira, se vier vazio ou igual ao nome) o apelido de um Pokémon. Só vale a partir de «Grande amigo», não repete o
 * apelido de outro e ganha um agradinho de amizade na primeira vez que o Pokémon ganha um.
 */
export function setNickname(s: VillageState, id: string, raw: string, realName: string): Interaction {
  if (!canNickname(s, id)) return { ok: false, message: `${realName} ainda não tem intimidade para um apelido. Ele aceita a partir de «Grande amigo».` };
  const nick = cleanAnswer(raw, MAX_NICK_LEN);
  if (nick === '' || nick.toLowerCase() === realName.toLowerCase()) {
    if (!(id in s.nicks)) return { ok: false, message: `${realName} já se chama ${realName}.` };
    delete s.nicks[id];
    return { ok: true, message: `${realName} voltou a ser só ${realName}.` };
  }
  const taken = Object.entries(s.nicks).some(([k, v]) => k !== id && v.toLowerCase() === nick.toLowerCase());
  if (taken) return { ok: false, message: `Outro Pokémon já usa «${nick}». Escolha um apelido só dele.` };
  const first = !(id in s.nicks);
  if (first && Object.keys(s.nicks).length >= MAX_NICKS) return { ok: false, message: 'Já são apelidos demais! Tire algum antes.' };
  s.nicks[id] = nick;
  if (first) {
    const f = friendOf(s, id);
    f.points = Math.min(100, f.points + 3);
  }
  return { ok: true, message: first ? `${realName} adorou! A partir de agora é «${nick}». (+3 de amizade)` : `Pronto: agora ele é «${nick}».` };
}

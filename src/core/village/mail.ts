import { itemDef } from './catalog';
import type { Friendship, ItemId, VillageState } from './life';
import type { Moment, SocialPlanKind } from './social-state';

/** O correio guarda acontecimentos reais da Vila. Cartas nunca inventam um momento: elas nascem do Diário. */
export type MailKind = 'agradecimento' | 'pedido' | 'convite' | 'rumor' | 'jornal';
export type MailAction = 'responder' | 'ajudar' | 'arquivar';

export interface VillageMail {
  id: string;
  day: string;
  fromId: string | null;
  fromName: string;
  kind: MailKind;
  subject: string;
  body: string;
  involvedIds: string[];
  momentId?: string;
  reward?: { coins?: number; item?: ItemId; qty?: number };
  read: boolean;
  responded: boolean;
}

export interface MailState {
  inbox: VillageMail[];
  archive: VillageMail[];
  generatedDay: string;
}

export const emptyMail = (): MailState => ({ inbox: [], archive: [], generatedDay: '' });

const KINDS: readonly MailKind[] = ['agradecimento', 'pedido', 'convite', 'rumor', 'jornal'];
const str = (value: unknown, max: number): string => typeof value === 'string' ? value.slice(0, max) : '';
const cleanId = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value.slice(0, 80) : null;

/** Mantém o correio independente do módulo de vida (life.ts também normaliza MailState). */
function friendshipFor(state: VillageState, id: string): Friendship {
  return (state.friends[id] ??= { points: 0, lastTalk: '', lastGift: '', request: null });
}

function addMailReward(state: VillageState, item: ItemId, quantity: number): void {
  state.inventory[item] = Math.min(999, (state.inventory[item] ?? 0) + quantity);
  if (itemDef(item)?.kind === 'furniture' && !state.collected.includes(item)) state.collected.push(item);
}

function normalizeOne(raw: unknown): VillageMail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<VillageMail>;
  if (typeof r.id !== 'string' || typeof r.day !== 'string' || !KINDS.includes(r.kind as MailKind)) return null;
  const involvedIds = Array.isArray(r.involvedIds) ? [...new Set(r.involvedIds.map(cleanId).filter((id): id is string => !!id))].slice(0, 3) : [];
  const reward = r.reward && typeof r.reward === 'object'
    ? {
      ...(Number.isInteger(r.reward.coins) && (r.reward.coins ?? 0) > 0 ? { coins: Math.min(9999, r.reward.coins!) } : {}),
      ...(typeof r.reward.item === 'string' ? { item: r.reward.item as ItemId, qty: Number.isInteger(r.reward.qty) ? Math.max(1, Math.min(20, r.reward.qty!)) : 1 } : {}),
    }
    : undefined;
  return {
    id: r.id.slice(0, 100), day: r.day.slice(0, 12), fromId: cleanId(r.fromId), fromName: str(r.fromName, 48) || 'Correio da Vila', kind: r.kind as MailKind,
    subject: str(r.subject, 100) || 'Uma carta para você', body: str(r.body, 600), involvedIds,
    ...(typeof r.momentId === 'string' ? { momentId: r.momentId.slice(0, 100) } : {}), ...(reward && Object.keys(reward).length ? { reward } : {}),
    read: r.read === true, responded: r.responded === true,
  };
}

export function normalizeMail(raw: unknown): MailState {
  if (!raw || typeof raw !== 'object') return emptyMail();
  const r = raw as Partial<MailState>;
  const inbox = Array.isArray(r.inbox) ? r.inbox.map(normalizeOne).filter((mail): mail is VillageMail => !!mail).slice(-40) : [];
  const archive = Array.isArray(r.archive) ? r.archive.map(normalizeOne).filter((mail): mail is VillageMail => !!mail).slice(-120) : [];
  return { inbox, archive, generatedDay: str(r.generatedDay, 12) };
}

function names(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? 'alguém') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function kindFor(moment: Moment): MailKind {
  if (moment.kind === 'festa' || moment.kind === 'romance') return 'convite';
  if (moment.kind === 'drama' || moment.kind === 'rivalidade') return 'pedido';
  if (moment.kind === 'comedia') return 'rumor';
  return 'agradecimento';
}

/** A despedida da carta acompanha a amizade de quem escreve com você (nível de `FRIEND_LEVELS`, 0 a 4). */
const SIGN_OFF: readonly ((name: string) => string)[] = [
  (name) => `— ${name}`,
  (name) => `Até mais, ${name}`,
  (name) => `Um abraço, ${name}`,
  (name) => `Com carinho, ${name}`,
  (name) => `Do seu melhor amigo, ${name}`,
];

/** Id de modelo dos marcos de amizade com você (o mesmo de `social.ts`, repetido para o correio não depender dele). */
const FRIEND_MILESTONE_TPL = 'amizade-marco';

/** O que quem escreve disse no momento (a primeira fala de verdade, sem as rubricas entre parênteses). */
function ownWords(moment: Moment): string {
  return moment.lines.find((line) => line.who === 0 && !line.text.startsWith('('))?.text ?? '';
}

/**
 * Cria uma carta a partir de um momento concluído, escrita por quem abriu a cena: o que aconteceu, com quem, a fala dele
 * e o registro do Diário, com uma despedida que muda com a amizade (`level`). O id do momento impede duplicatas.
 */
export function mailFromMoment(moment: Moment, level = 0): VillageMail | null {
  if (moment.cast.length === 0 || moment.kind === 'solo') return null;
  const involvedIds = moment.cast.map((entry) => entry.id).slice(0, 3);
  const involvedNames = moment.cast.map((entry) => entry.name).slice(0, 3);
  const milestone = moment.tpl === FRIEND_MILESTONE_TPL;
  const kind = milestone ? (moment.kind === 'drama' ? 'pedido' : 'agradecimento') : kindFor(moment);
  const first = involvedNames[0] ?? 'A Vila';
  const others = involvedNames.slice(1);
  const withOthers = others.length > 0 ? ` com ${names(others)}` : '';
  const said = ownWords(moment);
  const result = moment.result.find((line) => line.trim());
  const signOff = (SIGN_OFF[Math.max(0, Math.min(SIGN_OFF.length - 1, Math.round(level)))] ?? SIGN_OFF[0]!)(first);
  const subject = milestone ? moment.title : kind === 'pedido' ? `Um pedido depois de “${moment.title}”` : kind === 'convite' ? `Convite: ${moment.title}` : `Sobre ${moment.title}`;
  const opening = milestone
    ? said
    : kind === 'rumor'
      ? `Você viu o que aconteceu em “${moment.title}”${withOthers}? Eu ainda estou rindo.${said ? ` Eu bem que disse: “${said}”` : ''}`
      : kind === 'pedido'
        ? `Não paro de pensar em “${moment.title}”${withOthers}.${said ? ` Eu disse: “${said}”` : ''} Se puder, me ajuda a resolver isso?`
        : kind === 'convite'
          ? `Queria que você estivesse em “${moment.title}”${withOthers}!${said ? ` Eu disse: “${said}”` : ''} Da próxima vez, vem junto?`
          : `Queria te contar de “${moment.title}”${withOthers}.${said ? ` Eu disse: “${said}”` : ''}`;
  const body = `${opening}${result ? ` 📓 No Diário: ${result}.` : ''} ${signOff}`.trim();
  return {
    id: `carta-${moment.id}`,
    day: moment.day,
    fromId: involvedIds[0] ?? null,
    fromName: first,
    kind,
    subject,
    body,
    involvedIds,
    momentId: moment.id,
    read: false,
    responded: false,
  };
}

/** Enfileira uma carta de um momento sem repetir a mesma lembrança. `levelOf` dá a amizade de quem escreve com você. */
export function queueMomentMail(state: MailState, moment: Moment, levelOf: (id: string) => number = () => 0): VillageMail | null {
  const mail = mailFromMoment(moment, moment.cast[0] ? levelOf(moment.cast[0].id) : 0);
  if (!mail || [...state.inbox, ...state.archive].some((entry) => entry.id === mail.id)) return null;
  state.inbox = [...state.inbox, mail].slice(-40);
  return mail;
}

/** Gera uma edição diária apenas com fatos disponíveis no estado atual. */
export function generateDailyMail(state: VillageState, day: string, actorNames: Readonly<Record<string, string>>, levelOf: (id: string) => number = () => 0): VillageMail | null {
  if (state.mail.generatedDay === day) return null;
  state.mail.generatedDay = day;
  const latest = [...state.diary].reverse().find((moment) => moment.day <= day);
  const fromMoment = latest ? mailFromMoment(latest, latest.cast[0] ? levelOf(latest.cast[0].id) : 0) : null;
  if (fromMoment && ![...state.mail.inbox, ...state.mail.archive].some((entry) => entry.id === fromMoment.id)) {
    state.mail.inbox = [...state.mail.inbox, fromMoment].slice(-40);
    return fromMoment;
  }
  const people = Object.values(actorNames).filter(Boolean).slice(0, 3);
  const bulletin: VillageMail = {
    id: `jornal-${day}`,
    day,
    fromId: null,
    fromName: 'Jornal da Vila',
    kind: 'jornal',
    subject: 'Edição da praça',
    body: people.length > 0
      ? `Na praça hoje: ${names(people)}. Ainda não aconteceu nada de novo entre os moradores; quando acontecer, o Correio traz a história.`
      : 'A praça está quieta hoje. Quando algo acontecer entre os moradores, o Correio traz a história.',
    involvedIds: [],
    read: false,
    responded: false,
  };
  state.mail.inbox = [...state.mail.inbox, bulletin].slice(-40);
  return bulletin;
}

export function markMailRead(state: MailState, id: string): boolean {
  const mail = state.inbox.find((entry) => entry.id === id);
  if (!mail || mail.read) return false;
  mail.read = true;
  return true;
}

function shiftDay(day: string, days: number): string {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return day;
  const date = new Date(parsed + days * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Aplica uma resposta e cria, quando cabe, um plano social que os próximos momentos poderão cumprir. */
export function respondToMail(state: VillageState, id: string, action: MailAction, day: string): { ok: boolean; message: string } {
  const index = state.mail.inbox.findIndex((entry) => entry.id === id);
  if (index < 0) return { ok: false, message: 'Essa carta já foi guardada.' };
  const mail = state.mail.inbox[index]!;
  mail.read = true;
  if (action === 'arquivar') {
    state.mail.inbox.splice(index, 1);
    state.mail.archive = [...state.mail.archive, mail].slice(-120);
    return { ok: true, message: 'Carta guardada no arquivo do Correio.' };
  }
  const participants = mail.involvedIds;
  if (action === 'responder' && mail.fromId) {
    const friendship = friendshipFor(state, mail.fromId);
    friendship.points = Math.min(100, friendship.points + 4);
    mail.responded = true;
  }
  if (action === 'ajudar' && mail.fromId) {
    const friendship = friendshipFor(state, mail.fromId);
    friendship.points = Math.min(100, friendship.points + 2);
    const target = participants.find((entry) => entry !== mail.fromId);
    if (target) {
      state.plans = [...state.plans.filter((plan) => !(plan.from === mail.fromId && plan.to === target && plan.kind === 'ajudar')), {
        id: `plano-carta-${mail.id}`,
        from: mail.fromId,
        to: target,
        kind: 'ajudar' as SocialPlanKind,
        createdDay: day,
        expiresDay: shiftDay(day, 3),
        sourceMomentId: mail.momentId ?? mail.id,
      }].slice(-24);
    }
    mail.responded = true;
  }
  if (mail.reward?.coins) state.coins = Math.min(999999, state.coins + mail.reward.coins);
  if (mail.reward?.item) addMailReward(state, mail.reward.item, mail.reward.qty ?? 1);
  state.mail.inbox.splice(index, 1);
  state.mail.archive = [...state.mail.archive, mail].slice(-120);
  const bond = mail.fromId ? ` ❤️ +${action === 'responder' ? 4 : 2} amizade com ${mail.fromName}.` : '';
  return {
    ok: true,
    message: !mail.fromId
      ? 'Carta lida e guardada no arquivo do Correio.'
      : action === 'responder'
        ? `Você respondeu ${mail.kind === 'rumor' ? 'brincando' : 'com carinho'} a ${mail.fromName}.${bond}`
        : mail.kind === 'convite'
          ? `Você confirmou presença com ${mail.fromName}. Um novo momento pode nascer disso.${bond}`
          : `Você prometeu ajudar ${mail.fromName}. Um novo momento pode nascer disso.${bond}`,
  };
}

export function mailActionLabel(action: MailAction, kind: MailKind): string {
  if (action === 'arquivar') return 'Guardar no arquivo';
  if (action === 'ajudar') return kind === 'convite' ? 'Confirmar presença' : 'Prometer ajuda';
  return kind === 'rumor' ? 'Responder brincando' : 'Responder com carinho';
}

export const mailKindLabel: Record<MailKind, string> = { agradecimento: 'Agradecimento', pedido: 'Pedido', convite: 'Convite', rumor: 'Boato', jornal: 'Jornal' };



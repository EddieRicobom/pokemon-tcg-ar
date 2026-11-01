/**
 * Diário curto do pareamento do PvP, para depurar com quem está jogando: cada passo vira um código de 2 a 3 letras com o
 * tempo desde o começo («H3 4.6s»). A tela do lobby mostra os últimos códigos e um botão copia o diário inteiro numa linha
 * que dá para colar numa conversa. Não guarda nada no aparelho nem manda para lugar nenhum.
 *
 * Anfitrião: H1 sala criada · H2 convite pronto · H3 convidado bateu · H4 convite enviado · H5 resposta chegou ·
 * H6 resposta aceita · H7 resposta recusada · H8 conexão aberta · H9 conexão não fechou (convite novo) · HC sala trocou de código.
 * Convidado: G1 procurando a sala · G2 convite chegou · G3 resposta pronta · G4 resposta enviada · G5 conexão aberta ·
 * G6 conexão caiu · G7 sala ocupada · G8 sala não encontrada · G9 não conectou a tempo.
 * Rede: B<n> brokers ligados · C h/s/r candidatos locais (host, srflx, relay) · I:<estado> do ICE · P:<par> caminho escolhido.
 */

interface Entry {
  code: string;
  at: number;
  detail?: string;
}

const MAX_ENTRIES = 60;
let entries: Entry[] = [];
let startedAt = 0;
const listeners = new Set<() => void>();

/** Começa um diário novo (ao abrir o lobby). */
export function pvpLogReset(): void {
  entries = [];
  startedAt = Date.now();
  for (const fn of listeners) fn();
}

export function pvpLog(code: string, detail?: string): void {
  if (startedAt === 0) startedAt = Date.now();
  entries.push({ code, at: Date.now() - startedAt, detail: detail?.slice(0, 40) });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  try {
    console.info(`[pvp] ${code}${detail ? ` ${detail}` : ''} +${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch {
    /* sem console */
  }
  for (const fn of listeners) fn();
}

/** Uma linha só, para copiar: «PVP1 H1 0.0 · H2 4.6 (812ms) · …». */
export function pvpLogText(): string {
  return `PVP1 ${entries.map((e) => `${e.code} ${(e.at / 1000).toFixed(1)}${e.detail ? ` (${e.detail})` : ''}`).join(' · ')}`;
}

/** Os últimos códigos, para a linha discreta da tela. */
export function pvpLogTail(count = 8): string {
  return entries.slice(-count).map((e) => e.code).join(' ');
}

export function onPvpLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Conta os candidatos de rede de um SDP: «h2 s1 r0». */
export function candidateSummary(sdp: string): string {
  const count = (type: string) => (sdp.match(new RegExp(`typ ${type}`, 'g')) ?? []).length;
  return `h${count('host')} s${count('srflx')} r${count('relay')}`;
}

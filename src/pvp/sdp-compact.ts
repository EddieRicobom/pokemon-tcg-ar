/**
 * O SDP de uma conexão só com canal de dados (o do PvP) é quase todo igual de um celular para o outro. O que muda de
 * verdade é pouco: usuário e senha do ICE, a impressão digital do certificado (32 bytes) e os endereços de rede. Este
 * módulo guarda só isso em binário (~100 a 150 bytes em vez de ~1 KB de texto) e reconstrói o SDP do outro lado.
 *
 * Só comprime o que sabe reconstruir igual: se o navegador gerar algo fora do padrão (outra porta SCTP, outro algoritmo de
 * impressão digital, mais de uma mídia, candidato TCP ou de relay…), `compactSdp` devolve null e o código usa o formato
 * completo (`codec.ts`).
 */

export type SdpKind = 'offer' | 'answer';

const MAX_CANDIDATES = 6;
const SCTP_PORT = 5000;
const MAX_MESSAGE_SIZE = 262144;
const ICE_CHARS = /^[A-Za-z0-9+/]{4,40}$/;

type AddrKind = 'v4' | 'v6' | 'mdns';
interface Candidate {
  type: 'host' | 'srflx';
  addr: AddrKind;
  bytes: Uint8Array;
  port: number;
  priority: number;
}

export interface SdpParts {
  kind: SdpKind;
  ufrag: string;
  pwd: string;
  fingerprint: Uint8Array;
  candidates: Candidate[];
}

/** Linhas que existem em todo SDP de canal de dados e que a reconstrução refaz sozinha. */
const KNOWN_LINES = [
  /^v=0$/,
  /^o=/,
  /^s=-$/,
  /^t=0 0$/,
  /^a=group:BUNDLE 0$/,
  /^a=extmap-allow-mixed$/,
  /^a=msid-semantic:/,
  /^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/,
  /^c=IN IP4 /,
  /^a=ice-options:trickle$/,
  /^a=end-of-candidates$/,
  /^a=mid:0$/,
];

function parseIPv4(text: string): Uint8Array | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const bytes = m.slice(1).map(Number);
  return bytes.every((n) => n <= 255) ? Uint8Array.from(bytes) : null;
}

function parseIPv6(text: string): Uint8Array | null {
  if (!/^[0-9a-fA-F:]+$/.test(text) || (text.match(/::/g) ?? []).length > 1) return null;
  const [head = '', tail] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => {
    const n = parseInt(g, 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 0xff;
  });
  return out;
}

function parseMdns(text: string): Uint8Array | null {
  const m = /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})\.local$/.exec(text);
  if (!m) return null;
  const hex = m.slice(1).join('');
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

function hex(bytes: Uint8Array): string[] {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
}

function formatAddr(kind: AddrKind, b: Uint8Array): string {
  if (kind === 'v4') return Array.from(b).join('.');
  if (kind === 'v6') {
    const g: string[] = [];
    for (let i = 0; i < 16; i += 2) g.push(((b[i]! << 8) | b[i + 1]!).toString(16));
    return g.join(':');
  }
  const h = hex(b).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Lê o SDP. Devolve null se houver qualquer coisa que a versão compacta não saiba reconstruir. */
export function parseSdp(sdp: string, kind: SdpKind): SdpParts | null {
  const lines = sdp.split(/\r?\n/).filter((l) => l !== '');
  let ufrag = '';
  let pwd = '';
  let fingerprint: Uint8Array | null = null;
  let setup = '';
  let sctpPort = -1;
  let maxMessage = MAX_MESSAGE_SIZE;
  let mediaLines = 0;
  const found: Candidate[] = [];

  for (const line of lines) {
    if (line.startsWith('m=')) mediaLines++;
    let m: RegExpExecArray | null;
    if ((m = /^a=ice-ufrag:(.+)$/.exec(line))) ufrag = m[1]!;
    else if ((m = /^a=ice-pwd:(.+)$/.exec(line))) pwd = m[1]!;
    else if ((m = /^a=fingerprint:sha-256 ((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})$/.exec(line))) {
      fingerprint = Uint8Array.from(m[1]!.split(':').map((h) => parseInt(h, 16)));
    } else if ((m = /^a=setup:(\w+)$/.exec(line))) setup = m[1]!;
    else if ((m = /^a=sctp-port:(\d+)$/.exec(line))) sctpPort = Number(m[1]);
    else if ((m = /^a=max-message-size:(\d+)$/.exec(line))) maxMessage = Number(m[1]);
    else if (line.startsWith('a=candidate:')) {
      const c = /^a=candidate:\S+ 1 udp (\d+) (\S+) (\d+) typ (host|srflx)(?: raddr \S+ rport \d+)?(?: generation \d+)?(?: network-id \d+)?(?: network-cost \d+)?$/i.exec(line);
      if (!c) return null; // TCP, relay, componente 2 ou campo desconhecido
      const address = c[2]!;
      if (address.toLowerCase().startsWith('fe80:')) continue; // endereço de link local: não serve fora do aparelho
      const v4 = parseIPv4(address);
      const v6 = v4 ? null : parseIPv6(address);
      const mdns = v4 || v6 ? null : parseMdns(address);
      const bytes = v4 ?? v6 ?? mdns;
      if (!bytes) return null;
      const port = Number(c[3]);
      if (port < 1 || port > 65535) return null;
      found.push({ type: c[4]!.toLowerCase() as 'host' | 'srflx', addr: v4 ? 'v4' : v6 ? 'v6' : 'mdns', bytes, port, priority: Number(c[1]) });
    } else if (!KNOWN_LINES.some((re) => re.test(line))) return null;
  }

  if (mediaLines !== 1 || sctpPort !== SCTP_PORT || maxMessage !== MAX_MESSAGE_SIZE) return null;
  if (setup !== (kind === 'offer' ? 'actpass' : 'active')) return null;
  if (!fingerprint || !ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd)) return null;

  // Os endereços vistos de fora (srflx) são os que atravessam redes: ficam sempre. O resto entra por prioridade.
  const srflx = found.filter((c) => c.type === 'srflx').slice(0, 2);
  const host = found.filter((c) => c.type === 'host').sort((a, b) => b.priority - a.priority);
  const candidates = [...host.slice(0, MAX_CANDIDATES - srflx.length), ...srflx];
  if (candidates.length === 0) return null;
  return { kind, ufrag, pwd, fingerprint, candidates };
}

const VERSION = 1;

export function packSdp(parts: SdpParts): Uint8Array {
  const out: number[] = [(VERSION << 4) | (parts.kind === 'answer' ? 8 : 0)];
  for (const text of [parts.ufrag, parts.pwd]) {
    out.push(text.length);
    for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  }
  out.push(...parts.fingerprint, parts.candidates.length);
  for (const c of parts.candidates) {
    out.push((c.type === 'srflx' ? 1 : 0) | ((c.addr === 'v4' ? 0 : c.addr === 'v6' ? 1 : 2) << 1), ...c.bytes, c.port >> 8, c.port & 0xff);
  }
  const body = Uint8Array.from(out);
  const crc = crc16(body);
  const all = new Uint8Array(body.length + 2);
  all.set(body, 0);
  all[body.length] = crc >> 8;
  all[body.length + 1] = crc & 0xff;
  return all;
}

export type UnpackResult = { ok: true; parts: SdpParts } | { ok: false; reason: 'incomplete' | 'version' };

export function unpackSdp(bytes: Uint8Array): UnpackResult {
  if (bytes.length < 40) return { ok: false, reason: 'incomplete' };
  const body = bytes.subarray(0, bytes.length - 2);
  if (crc16(body) !== ((bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!)) return { ok: false, reason: 'incomplete' };
  if (body[0]! >> 4 !== VERSION) return { ok: false, reason: 'version' };
  const kind: SdpKind = body[0]! & 8 ? 'answer' : 'offer';
  let pos = 1;
  const take = (n: number): Uint8Array | null => {
    if (pos + n > body.length) return null;
    const slice = body.subarray(pos, pos + n);
    pos += n;
    return slice;
  };
  const text = (): string | null => {
    const len = take(1)?.[0];
    const raw = len === undefined ? null : take(len);
    return raw ? String.fromCharCode(...raw) : null;
  };
  const ufrag = text();
  const pwd = text();
  const fingerprint = take(32);
  const count = take(1)?.[0];
  if (ufrag === null || pwd === null || !fingerprint || count === undefined || count < 1 || count > MAX_CANDIDATES) return { ok: false, reason: 'incomplete' };
  if (!ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd)) return { ok: false, reason: 'incomplete' };
  const candidates: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const flags = take(1)?.[0];
    if (flags === undefined) return { ok: false, reason: 'incomplete' };
    const addr: AddrKind = [('v4' as const), ('v6' as const), ('mdns' as const)][(flags >> 1) & 3] ?? 'v4';
    const addrBytes = take(addr === 'v4' ? 4 : 16);
    const port = take(2);
    if (!addrBytes || !port) return { ok: false, reason: 'incomplete' };
    const type = flags & 1 ? 'srflx' : 'host';
    candidates.push({ type, addr, bytes: Uint8Array.from(addrBytes), port: (port[0]! << 8) | port[1]!, priority: 0 });
  }
  if (pos !== body.length) return { ok: false, reason: 'incomplete' };
  return { ok: true, parts: { kind, ufrag, pwd, fingerprint: Uint8Array.from(fingerprint), candidates } };
}

/** Refaz um SDP completo a partir das partes. As prioridades seguem a regra padrão do ICE (tipo, depois ordem). */
export function buildSdp(parts: SdpParts): string {
  const first = parts.candidates.find((c) => c.addr === 'v4' && c.type === 'host') ?? parts.candidates.find((c) => c.addr === 'v4');
  const lines = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    `m=application ${first?.port ?? 9} UDP/DTLS/SCTP webrtc-datachannel`,
    `c=IN IP4 ${first ? formatAddr('v4', first.bytes) : '0.0.0.0'}`,
  ];
  parts.candidates.forEach((c, i) => {
    const typePref = c.type === 'host' ? 126 : 100;
    const priority = typePref * 2 ** 24 + (65535 - i) * 256 + 255;
    const address = formatAddr(c.addr, c.bytes);
    const related = c.type === 'srflx' ? ` raddr ${c.addr === 'v6' ? '::' : '0.0.0.0'} rport 0` : '';
    lines.push(`a=candidate:${i + 1} 1 udp ${priority} ${address} ${c.port} typ ${c.type}${related} generation 0`);
  });
  lines.push(
    'a=end-of-candidates',
    `a=ice-ufrag:${parts.ufrag}`,
    `a=ice-pwd:${parts.pwd}`,
    `a=fingerprint:sha-256 ${hex(parts.fingerprint).join(':').toUpperCase()}`,
    `a=setup:${parts.kind === 'offer' ? 'actpass' : 'active'}`,
    'a=mid:0',
    `a=sctp-port:${SCTP_PORT}`,
    `a=max-message-size:${MAX_MESSAGE_SIZE}`,
  );
  return lines.join('\r\n') + '\r\n';
}

export function compactSdp(sdp: string, kind: SdpKind): Uint8Array | null {
  const parts = parseSdp(sdp, kind);
  return parts ? packSdp(parts) : null;
}

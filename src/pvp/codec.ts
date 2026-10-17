/**
 * Código de pareamento do PvP: o convite (offer) e a resposta (answer) do WebRTC viram um texto curto para copiar e colar
 * (WhatsApp, por exemplo). Sem servidor: os dois celulares só trocam esses dois códigos uma vez.
 *
 * Formato principal: `PINc.<base64url>` (~150 caracteres): só o que muda de um SDP de canal de dados para outro, em binário,
 * com verificação de integridade (`sdp-compact.ts`). Reserva, quando o SDP foge do padrão: `PINz.<base64url>` (JSON do SDP
 * inteiro comprimido com deflate-raw) ou `PINj.<base64url>` (JSON puro, quando o navegador não comprime). Espaços e quebras
 * de linha na colagem são ignorados.
 */
import { buildSdp, compactSdp, unpackSdp } from './sdp-compact';

export type CodeKind = 'offer' | 'answer';

const VERSION = 1;
const MAX_CODE_LENGTH = 20000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Se a leitura falhar (código cortado), o erro aparece no reader; aqui só evitamos a rejeição sem dono.
  void writer.write(bytes as unknown as BufferSource).then(() => writer.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const canCompress = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodeCode(kind: CodeKind, sdp: string): Promise<string> {
  const compact = compactSdp(sdp, kind);
  if (compact) return `PINc.${toBase64Url(compact)}`;
  const json = new TextEncoder().encode(JSON.stringify({ v: VERSION, k: kind, s: sdp }));
  if (canCompress()) return `PINz.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  return `PINj.${toBase64Url(json)}`;
}

export type DecodeResult = { ok: true; sdp: string } | { ok: false; message: string };

/** Lê o código colado. `expect` impede colar o código errado (convite onde cabe a resposta e vice-versa). */
export async function decodeCode(text: string, expect: CodeKind): Promise<DecodeResult> {
  const code = text.replace(/\s+/g, '');
  if (code.length === 0) return { ok: false, message: 'Cole o código primeiro.' };
  if (code.length > MAX_CODE_LENGTH) return { ok: false, message: 'Esse texto é grande demais para ser um código de partida de Pins.' };
  const match = /^PIN([zjc])\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!match) return { ok: false, message: 'Esse texto não parece um código de partida de Pins. Copie o código inteiro, começando por PIN.' };
  const wrongKind = () => ({
    ok: false as const,
    message: expect === 'offer' ? 'Esse é um código de resposta. Aqui vai o código de convite do anfitrião.' : 'Esse é um código de convite. Aqui vai o código de resposta do amigo.',
  });
  if (match[1] === 'c') {
    try {
      const unpacked = unpackSdp(fromBase64Url(match[2]!));
      if (!unpacked.ok) {
        return unpacked.reason === 'version'
          ? { ok: false, message: 'Código de outra versão do app. Atualize os dois celulares.' }
          : { ok: false, message: 'O código está incompleto ou foi alterado. Copie de novo, inteiro.' };
      }
      if (unpacked.parts.kind !== expect) return wrongKind();
      return { ok: true, sdp: buildSdp(unpacked.parts) };
    } catch {
      return { ok: false, message: 'O código está incompleto ou foi alterado. Copie de novo, inteiro.' };
    }
  }
  try {
    let bytes = fromBase64Url(match[2]!);
    if (match[1] === 'z') {
      if (!canCompress()) return { ok: false, message: 'Este navegador não consegue abrir códigos comprimidos. Atualize o navegador.' };
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; k?: unknown; s?: unknown };
    if (data.v !== VERSION || typeof data.s !== 'string' || data.s.length === 0) return { ok: false, message: 'Código de outra versão do app. Atualize os dois celulares.' };
    if (data.k !== expect) return wrongKind();
    return { ok: true, sdp: data.s };
  } catch {
    return { ok: false, message: 'O código está incompleto ou foi alterado. Copie de novo, inteiro.' };
  }
}

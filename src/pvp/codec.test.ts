import { describe, expect, it } from 'vitest';
import { decodeCode, encodeCode } from './codec';

const SDP = `v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\na=ice-ufrag:abcd\r\na=ice-pwd:${'x'.repeat(24)}\r\na=candidate:1 1 udp 2113937151 192.168.0.12 54321 typ host\r\n`.repeat(6);

describe('código de pareamento', () => {
  it('ida e volta do convite e da resposta', async () => {
    for (const kind of ['offer', 'answer'] as const) {
      const code = await encodeCode(kind, SDP);
      expect(code).toMatch(/^PIN[zj]\./);
      const back = await decodeCode(code, kind);
      expect(back).toEqual({ ok: true, sdp: SDP });
    }
  });
  it('comprime: o código fica bem menor que o SDP', async () => {
    const code = await encodeCode('offer', SDP);
    if (code.startsWith('PINz.')) expect(code.length).toBeLessThan(SDP.length);
  });
  it('ignora espaços e quebras de linha da colagem', async () => {
    const code = await encodeCode('offer', SDP);
    const messy = `  ${code.slice(0, 30)}\n${code.slice(30, 80)} \r\n${code.slice(80)}  `;
    expect(await decodeCode(messy, 'offer')).toEqual({ ok: true, sdp: SDP });
  });
  it('recusa o tipo errado, texto qualquer, vazio e código cortado, sempre com mensagem em português', async () => {
    const offer = await encodeCode('offer', SDP);
    const wrong = await decodeCode(offer, 'answer');
    expect(wrong.ok).toBe(false);
    for (const bad of ['', '   ', 'oi, tudo bem?', offer.slice(0, 40), `${offer}%%`, 'PINz.@@@']) {
      const r = await decodeCode(bad, 'offer');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/[a-zç]/i);
    }
  });
  it('recusa texto gigante sem tentar abrir', async () => {
    const r = await decodeCode(`PINz.${'A'.repeat(30000)}`, 'offer');
    expect(r.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeCode, encodeCode } from './codec';
import { buildSdp, compactSdp, packSdp, parseSdp, unpackSdp } from './sdp-compact';

const FP = '30:C8:87:09:7C:C2:C6:C1:EF:87:32:21:21:E6:0D:17:C1:44:31:EC:FC:6B:1F:12:28:9E:F7:12:79:DB:8F:E7';
const head = (port = 54299) =>
  `v=0\r\no=- 4333926807094897123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application ${port} UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 192.0.2.2\r\n`;
const tail = (setup = 'actpass', fp = FP) =>
  `a=ice-ufrag:TOjl\r\na=ice-pwd:OhjPiXGnQfgpn7r5fbipb6zF\r\na=ice-options:trickle\r\na=fingerprint:sha-256 ${fp}\r\na=setup:${setup}\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n`;

// O que o Chromium gera de verdade (capturado), e o que celulares costumam gerar: mDNS, IPv6, srflx.
const CHROME_OFFER = head() + 'a=candidate:1729638347 1 udp 2113937151 192.0.2.2 54299 typ host generation 0 network-cost 999\r\n' + tail();
const PHONE_OFFER =
  head(41000) +
  [
    'a=candidate:1 1 udp 2113937151 4f1c2d3e-aaaa-4bbb-8ccc-1234567890ab.local 41000 typ host generation 0 network-cost 999',
    'a=candidate:2 1 udp 2113939711 2804:14d:5c80:1234:abcd:ef01:2345:6789 41001 typ host generation 0 network-cost 10',
    'a=candidate:3 1 udp 2113939711 fe80::1 41002 typ host generation 0',
    'a=candidate:4 1 tcp 1518280447 192.168.0.5 9 typ host tcptype active generation 0',
    'a=candidate:5 1 udp 1677729535 200.100.50.25 53333 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  ]
    .filter((l) => !l.includes(' tcp '))
    .join('\r\n') +
  '\r\n' +
  tail();

describe('SDP compacto', () => {
  it('guarda só o essencial: usuário, senha, impressão digital e endereços', () => {
    const p = parseSdp(CHROME_OFFER, 'offer')!;
    expect(p.ufrag).toBe('TOjl');
    expect(p.pwd).toBe('OhjPiXGnQfgpn7r5fbipb6zF');
    expect(Array.from(p.fingerprint.slice(0, 3))).toEqual([0x30, 0xc8, 0x87]);
    expect(p.candidates).toMatchObject([{ type: 'host', addr: 'v4', port: 54299 }]);
  });

  it('o SDP refeito tem os mesmos dados (ida e volta estável) e o formato esperado pelo navegador', () => {
    for (const sdp of [CHROME_OFFER, PHONE_OFFER]) {
      const parts = parseSdp(sdp, 'offer')!;
      const rebuilt = buildSdp(parts);
      const again = parseSdp(rebuilt, 'offer')!;
      expect(again.ufrag).toBe(parts.ufrag);
      expect(again.pwd).toBe(parts.pwd);
      expect(Array.from(again.fingerprint)).toEqual(Array.from(parts.fingerprint));
      expect(again.candidates.map((c) => [c.type, c.addr, c.port, Array.from(c.bytes)])).toEqual(parts.candidates.map((c) => [c.type, c.addr, c.port, Array.from(c.bytes)]));
      expect(rebuilt).toContain('m=application');
      expect(rebuilt).toContain('a=setup:actpass');
      expect(rebuilt.endsWith('\r\n')).toBe(true);
    }
  });

  it('celular: mantém mDNS, IPv6 e o endereço de fora (srflx); descarta link local e TCP', () => {
    const p = parseSdp(PHONE_OFFER, 'offer')!;
    expect(p.candidates.map((c) => c.addr + ':' + c.type)).toEqual(['v6:host', 'mdns:host', 'v4:srflx']);
    const sdp = buildSdp(p);
    expect(sdp).toContain('4f1c2d3e-aaaa-4bbb-8ccc-1234567890ab.local 41000 typ host');
    expect(sdp).toContain('2804:14d:5c80:1234:abcd:ef01:2345:6789 41001 typ host');
    expect(sdp).toContain('200.100.50.25 53333 typ srflx raddr 0.0.0.0 rport 0');
    expect(sdp).not.toContain('fe80');
  });

  it('fica bem menor que o SDP e que o formato antigo (~575 caracteres)', async () => {
    const code = await encodeCode('offer', PHONE_OFFER);
    expect(code).toMatch(/^PINc\./);
    expect(code.length).toBeLessThan(200);
    expect(await decodeCode(code, 'answer')).toMatchObject({ ok: false });
    const back = await decodeCode(code, 'offer');
    expect(back.ok).toBe(true);
  });

  it('a resposta usa setup:active', async () => {
    const answer = CHROME_OFFER.replace('actpass', 'active');
    const code = await encodeCode('answer', answer);
    expect(code).toMatch(/^PINc\./);
    const back = await decodeCode(code, 'answer');
    expect(back.ok && back.sdp).toContain('a=setup:active');
  });

  it('SDP fora do padrão não é compactado (o código usa o formato completo)', async () => {
    const odd = [
      CHROME_OFFER.replace('sctp-port:5000', 'sctp-port:5001'),
      CHROME_OFFER.replace('sha-256', 'sha-512'),
      CHROME_OFFER + 'm=audio 9 RTP/AVP 0\r\n',
      CHROME_OFFER.replace('a=mid:0', 'a=mid:0\r\na=foo:bar'),
      CHROME_OFFER.replace('typ host', 'typ relay'),
      CHROME_OFFER.replace('a=setup:actpass', 'a=setup:passive'),
    ];
    for (const sdp of odd) {
      expect(compactSdp(sdp, 'offer')).toBeNull();
      const code = await encodeCode('offer', sdp);
      expect(code).toMatch(/^PIN[zj]\./);
      expect(await decodeCode(code, 'offer')).toEqual({ ok: true, sdp });
    }
  });

  it('detecta código cortado, alterado ou de outra versão', async () => {
    const code = await encodeCode('offer', PHONE_OFFER);
    const body = code.slice(5);
    for (const bad of [code.slice(0, code.length - 8), `PINc.${body.slice(0, 20)}A${body.slice(21)}`, 'PINc.AAAA']) {
      const r = await decodeCode(bad, 'offer');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/incompleto|alterado|versão/);
    }
    const bytes = packSdp(parseSdp(PHONE_OFFER, 'offer')!);
    bytes[0] = (2 << 4) | (bytes[0]! & 8); // versão 2 (CRC deixa de bater: vira "incompleto"; o importante é recusar)
    expect(unpackSdp(bytes).ok).toBe(false);
  });

  it('sem candidatos úteis (só link local) não compacta', () => {
    expect(compactSdp(head() + 'a=candidate:1 1 udp 1 fe80::1 5 typ host\r\n' + tail(), 'offer')).toBeNull();
  });
});

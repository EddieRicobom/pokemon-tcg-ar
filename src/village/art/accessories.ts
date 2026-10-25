import type { PixelBuf } from '../../box/ground-art';
import { center, crop, Pen, render, tones } from './pen';
import type { Palette } from './pen';

/**
 * Acessórios em pixel art no tamanho real: um pixel do desenho é um pixel do tileset da Vila, então o chapéu de um
 * Pokémon tem o mesmo "grão" do chão e das casas. Estilo dos acessórios da 4ª geração: cores vivas, três tons por
 * material, brilho branco de 1 pixel e contorno quase preto (aplicado no acabamento, por fora do desenho).
 *
 * Cada mapa usa a paleta `P(principal, segunda, terceira)`: a/b/c = luz/base/sombra da principal, d/e/f da segunda,
 * g/h/i da terceira; as outras letras são cores fixas (ver `FIXED`).
 */

const FIXED: Palette = {
  w: 0xf8f8f8, v: 0xc4ccdc, k: 0x34343e, y: 0xf8d038, t: 0xc89020, r: 0xe04040, p: 0xf898c0, u: 0x4880e8, n: 0x8a5a30,
  x: 0x68d8f0, o: 0xf09030, l: 0xb898e8, q: 0x58b850, z: 0x8858d0, s: 0xb8c0d0, m: 0x6a4a2a,
};

function P(main: number, second = main, third = second, extra: Palette = {}): Palette {
  return { ...FIXED, ...tones('abc', main), ...tones('def', second), ...tones('ghi', third), ...extra };
}

const RED = 0xe03c3c;
const BLUE = 0x3c6ee0;
const PINK = 0xf07cb0;
const YELLOW = 0xf8d038;
const GREEN = 0x48b048;
const PURPLE = 0x9058d0;
const ORANGE = 0xf08830;
const BROWN = 0xa06838;
const BLACK = 0x4a4a5a;
const WHITE = 0xe8e8f0;
const GOLD = 0xf8c030;
const SILVER = 0xb8c0d0;
const CYAN = 0x40c8e0;
const NAVY = 0x30407a;
const STRAW = 0xe8c060;
const CREAM = 0xf0e0b0;
const LILAC = 0xc0a8f0;
const TEAL = 0x30a8a0;

interface Sprite {
  rows: string;
  pal: Palette;
  /** Sem contorno automático (óculos e traços finos já vêm com o contorno no desenho). */
  bare?: boolean;
}

const s = (rows: string, pal: Palette, bare = false): Sprite => ({ rows, pal, ...(bare ? { bare } : {}) });

// Formas que se repetem com cores diferentes.
const BOW = `
aa.aa
abdbc
bc.cb
`;
const BOW_DOTS = `
aa.aa
awdwc
bc.cb
`;
const BOW_STRIPES = `
ae.ea
ebdec
bc.cb
`;
const BOW_TIE = `
ab.ba
abebc
bc.cb
`;
const FLOWER = `
.a.a.
abbbc
.byb.
abbbc
.c.c.
`;
const CAPE = `
.aaaaaaa.
abbbbbbbc
abbbbbbbc
abbbcbbbc
abbcbbcbc
.bc.bc.c.
`;
const TOP_HAT = `
.aaaa.
.abbc.
.abbc.
.eeef.
abbbbc
`;
const NECKTIE = `
.ab.
.bc.
abbc
abbc
.bc.
`;
const SCARF = `
abebbebc
bbebbebc
.....beb
.....bec
`;
const PIN = `
.aa.
abeb
.bc.
`;
const TROPHY = `
a.aa.a
abbbbc
.abbc.
..bc..
..bc..
.eeef.
`;

const ART: Record<string, Sprite> = {
  // ---------------------------------------------------------------- cabeça
  'chapeu-palha': s(`
..aaaa...
..bbbbc..
..eeeef..
abbbbbbbc
`, P(STRAW, RED)),
  bone: s(`
..aaa..
.abwbb.
.bbbbc.
.eeeeee
`, P(RED, 0xb02828)),
  'bone-treinador': s(`
..aaa..
.awrwb.
.bwwwc.
.eeeeee
`, P(BLUE, 0x2c4ca8)),
  cartola: s(TOP_HAT, P(BLACK, RED)),
  'cartola-branca': s(TOP_HAT, P(WHITE, 0x7a7a8a)),
  tiara: s(`
...a...
.a.b.a.
abbxbbc
`, P(GOLD)),
  gorro: s(`
..ww..
.abbb.
abbbbc
wwwwwv
`, P(BLUE)),
  'gorro-noel': s(`
....ww
..abv.
.abbc.
wwwwwv
`, P(RED)),
  'chapeu-bruxa': s(`
....ab.
...abc.
..abbc.
..eeef.
abbbbbc
`, P(0x5a4a7a, 0xd8a030)),
  'chapeu-festa': s(`
..h..
..a..
.abb.
.eeef
abbbc
`, P(PINK, YELLOW, CYAN)),
  'chapeu-chef': s(`
wwwwww
wwwwwv
.wwwv.
.vvvv.
`, P(WHITE)),
  'chapeu-cowboy': s(`
..abbc...
..abbbc..
..eeeef..
a.abbbc.c
abbbbbbbc
`, P(BROWN, 0x4a2e18)),
  capacete: s(`
..awa..
.abwbb.
abbwbbc
kkkkkkk
`, P(RED)),
  'capacete-obra': s(`
..aaa..
.ababb.
abbabbc
bbbbbbbc
`, P(YELLOW)),
  boina: s(`
...d...
.abbbb.
abbbbbc
.ccccc.
`, P(0xc03850, 0x8a2a38)),
  'coroa-real': s(`
.a.a.a.
ab.e.ba
abeeeba
abbhbbc
`, P(GOLD, RED, GREEN)),
  'coroa-gelo': s(`
a.a.a
babab
bbwbc
`, P(0x88e0f8)),
  'coroa-flores': s(`
.e..h..p.
edehghppp
bbbbbbbbb
`, P(GREEN, RED, YELLOW)),
  'coroa-girassol': s(`
.y...y.
ynyqyny
.y.b.y.
bbbbbbb
`, P(GREEN)),
  louros: s(`
a.......a
ba.....ab
.bba.abb.
...cyc...
`, P(GREEN)),
  guirlanda: s(`
a.a.a.a.a
babababac
.r..r..r.
`, P(GREEN)),
  'orelhas-gato': s(`
a.....a
bp...pb
bbbbbbb
`, P(BLACK)),
  'orelhas-coelho': s(`
.a...a.
apb.apb
apb.apb
.bbbbb.
`, P(WHITE)),
  'orelhas-urso': s(`
ab...ab
pb...pb
.bbbbb.
`, P(BROWN)),
  chifres: s(`
a.....a
ab...bc
.bcccb.
`, P(RED)),
  'chifre-unicornio': s(`
..a.
..ab
.apb
.bbc
`, P(0xfff0c0)),
  antenas: s(`
d.....d
.k...k.
..kkk..
`, P(BLACK, YELLOW)),
  bandana: s(`
.abbbbb..
abwbbwbcd
.ccccccdd
`, P(BLUE)),
  'lenco-cabeca': s(`
.abbbbb..
abybpbbcd
.ccccccdd
`, P(0x50a0e0)),
  fones: s(`
..aaa..
.a...a.
ee...ee
ff...ff
`, P(0x6a6a7a, RED)),
  'chapeu-sol': s(`
..aaaa...
..eeeef..
abbbbbbbc
`, P(CREAM, PINK)),
  'chapeu-explorador': s(`
..aaa..
.abbbb.
.eeeef.
abbbbbc
`, P(0xc8b078, 0x6a4a2a)),
  'chapeu-marinheiro': s(`
.wwwww.
wwwwwwv
.eeeee.
`, P(WHITE, NAVY)),
  quepe: s(`
.wwwww.
wwwwwwv
.eeyee.
.kkkkk.
`, P(WHITE, NAVY)),
  capelo: s(`
...a....
.abbbbc.
abbbbbbcy
..bbbb.y.
`, P(0x384068)),
  'chapeu-pirata': s(`
a.....a
abbbbba
.bbwbb.
..yyy..
`, P(BLACK)),
  'chapeu-bobo': s(`
y.....y
ab...ea
.bbaeh.
.bbbhh.
.cccii.
`, P(PURPLE, YELLOW, YELLOW)),
  'peruca-black': s(`
.abbba.
abbabbb
abbbbbc
bc...cb
`, P(ORANGE)),
  aureola: s(`
.aaaa.
a....a
.cccc.
`, P(GOLD)),
  'elmo-viking': s(`
d.....d
e.aaa.e
.abbbc.
.yyyyy.
`, P(SILVER, CREAM)),
  'elmo-cavaleiro': s(`
...ee.
..ef..
.abbb.
abkkkc
abbbbc
`, P(SILVER, RED)),
  'chapeu-cogumelo': s(`
..abbb..
.abwbbw.
abbbbwbc
.wbbbbc.
..vvvv..
`, P(RED)),
  'chapeu-abobora': s(`
...q...
.abcbc.
abbcbbc
.ccccc.
`, P(ORANGE)),
  'tiara-cristal': s(`
...a...
..aea..
.awbwa.
abbbbbc
`, P(0xd8e0f0, CYAN)),
  'touca-renda': s(`
w.w.w.w.w
wvwvwvwvw
.abbbbbc.
`, P(CYAN)),
  'tiara-brilho': s(`
...y...
.x.w.p.
abbbbbc
`, P(SILVER)),
  'tiara-coracoes': s(`
ab.ab.ab
bc.bc.bc
eeeeeeee
`, P(RED, PINK)),
  'tiara-estrelas': s(`
.y...y.
yyy.yyy
.y.y.y.
bbbbbbb
`, P(PINK)),
  'fita-chama': s(`
..o...
.oyo..
abbbbc
abbbbc
`, P(RED)),
  ninho: s(`
..w.x....
.abwbxa..
abcbcbcbc
`, P(BROWN)),
  nuvem: s(`
..ww....
.wwwwww.
wwwwwwwv
.vvvvvv.
`, P(WHITE)),
  'chapeu-fada': s(`
..a...
..ab..
.abbw.
.abbww
abbbcw
`, P(PINK)),

  // ---------------------------------------------------------------- enfeite de cabelo
  laco: s(BOW, P(PINK, 0xd85898)),
  'laco-poa': s(BOW_DOTS, P(PINK, 0xd85898)),
  'laco-azul': s(BOW, P(BLUE, 0x2848b0)),
  'laco-vermelho': s(BOW, P(RED, 0xb02828)),
  'laco-listrado': s(BOW_STRIPES, P(GREEN, YELLOW)),
  'laco-gigante': s(`
aa...aa
abbdbbc
abbdbbc
.cc.cc.
.e...e.
`, P(0xf87878, YELLOW)),
  'flor-orelha': s(FLOWER, P(0xff8ac8)),
  'flor-azul': s(FLOWER, P(0x5888f0)),
  'flor-vermelha': s(FLOWER, P(RED)),
  'folha-cabelo': s(`
...a
.abb
abc.
c...
`, P(GREEN)),
  'presilha-estrela': s(`
..a..
abwbc
.bcb.
.c.c.
`, P(YELLOW)),
  'presilha-coracao': s(`
ab.ab
awbbc
.bbc.
..c..
`, P(RED)),
  'pena-cabelo': s(`
...a
..ab
.abc
abc.
k...
`, P(0x88c8f8)),
  'floco-neve': s(`
a.a.a
.aba.
abwba
.aba.
a.a.a
`, P(0x9ae4ff)),

  // ---------------------------------------------------------------- olhos
  oculos: s(`
kkkk.kkkk
kwbbkwbbk
.kkk.kkk.
`, P(0x4a4a5a), true),
  'oculos-redondos': s(`
.nn...nn.
nxwnnnxwn
.nn...nn.
`, P(0, 0, 0, { x: 0xd8f0ff }), true),
  'oculos-sol-amarelo': s(`
ttttttttt
teewtewet
.ttt.ttt.
`, P(GOLD, 0xe8d040), true),
  'oculos-aro-preto': s(`
kkkk.kkkk
kwxkkkwxk
kkkk.kkkk
`, P(0, 0, 0, { x: 0xd8e8f8 }), true),
  'oculos-espiral': s(`
.kkk.kkk.
kwkwkwkwk
.kkk.kkk.
`, P(0), true),
  'oculos-coracao': s(`
a.a.a.a
abbkbbc
.bc.bc.
`, P(PINK)),
  'oculos-estrela': s(`
.a...a.
aea.aea
.a.k.a.
`, P(GOLD, PINK)),
  'oculos-neve': s(`
vvvvvvvvv
vdeeewwev
.vvvvvvv.
`, P(0, ORANGE)),
  'mascara-mergulho': s(`
.aaaaaa.e
abxwxxbbe
.cccccc.e
`, P(0x3888e8, YELLOW, 0, { x: 0xb8e8ff })),
  monoculo: s(`
.aa.
axwa
.ac.
...a
`, P(GOLD, 0, 0, { x: 0xd8f0ff })),
  'tapa-olho': s(`
aaaaaaaaa
.....bbc.
......c..
`, P(0x4a4a56)),
  mascara: s(`
abbbbbbba
bwkbbbwkc
.bc...bc.
`, P(0x3a6ad8)),
  'mascara-baile': s(`
........e
abbbbbbbe
bkkbybkkc
.bc...bc.
`, P(PURPLE, PINK)),
  'visor-futurista': s(`
abbbbbbbc
bbwbbbbbc
.ccccccc.
`, P(CYAN)),

  // ---------------------------------------------------------------- boca
  bigode: s(`
.a...a.
abbabbc
bc...cb
`, P(0x6a4a2e)),
  'bigode-fino': s(`
a.....a
ab.a.ba
.bc.cb.
`, P(0x3a3040)),
  'nariz-palhaco': s(`
.a.
awb
bbc
`, P(RED)),
  'barba-branca': s(`
w.....w
wwwwwwv
.wwwwv.
..wvv..
`, P(WHITE)),
  'mascara-pano': s(`
k.www.k
.kwwwk.
..vvv..
`, P(WHITE)),
  'rosa-boca': s(`
ab.....
bcqqqqq
`, P(RED)),

  // ---------------------------------------------------------------- pescoço
  cachecol: s(SCARF, P(RED, 0, 0, { e: 0xf8f8f8 })),
  'cachecol-listrado': s(SCARF, P(GREEN, 0, 0, { e: YELLOW })),
  gravata: s(BOW_TIE, P(RED, 0xa02828)),
  'gravata-preta': s(NECKTIE, P(BLACK)),
  'gravata-listrada': s(`
.ab.
.wb.
abwc
awbc
.bc.
`, P(BLUE, 0, 0, { w: 0xa8c8f8 })),
  medalha: s(`
e...h
.e.h.
.aaa.
abwbc
.ccc.
`, P(GOLD, RED, BLUE)),
  'colar-perolas': s(`
w.....w
.w...w.
..www..
`, P(WHITE)),
  'lenco-pescoco': s(`
abbbbbc
.abwbc.
..bbc..
...c...
`, P(YELLOW)),
  'colar-havaiano': s(`
p.....y
.ye.py.
..pyep.
`, P(0, RED)),
  sininho: s(`
eeeeeee
...a...
..abb..
.abbbc.
...k...
`, P(GOLD, RED)),
  'colar-estrela': s(`
a.....a
.a...a.
...a...
..aea..
..a.a..
`, P(GOLD, 0xfff0a0)),
  medalhao: s(`
a.....a
.a...a.
..aaa..
..awc..
...c...
`, P(GOLD)),
  'relogio-bolso': s(`
a....
.a...
..aa.
.awwa
.awkc
..cc.
`, P(GOLD)),
  'gola-palhaco': s(`
w.w.w.w.w
wrwwuwwyw
.w.w.w.w.
`, P(WHITE)),
  'laco-amizade': s(BOW_TIE, P(RED, 0xb02828)),
  'fita-torre': s(`
.aa.
abwb
.bc.
d..d
`, P(CYAN, 0x3a8ad8)),

  // ---------------------------------------------------------------- peito
  insignia: s(`
.aa.
aewc
ahbc
.cc.
`, P(GOLD, RED, BLUE)),
  'faixa-vencedor': s(`
aa....
.bb...
..byy.
...yb.
....bb
`, P(RED)),
  'pin-treinador': s(PIN, P(0x4a6ae8, YELLOW)),
  'pin-chefao': s(PIN, P(0x3a2a4a, RED)),
  'pin-pista': s(PIN, P(TEAL, YELLOW)),
  'broche-escudo': s(`
aaaa
awbc
.bc.
`, P(BLUE, GOLD)),
  avental: s(`
k....k
.wwww.
.wppw.
.wwwv.
..vv..
`, P(WHITE)),
  'rosa-lapela': s(`
ab.
bc.
.q.
q..
`, P(RED)),

  // ---------------------------------------------------------------- cintura
  'saia-folhas': s(`
nnnnnnnnnn
ababababab
a.b.a.b.a.
`, P(GREEN)),
  cinturao: s(`
eeeeaaaeeee
ffffacaffff
`, P(GOLD, 0x8a2a2a)),
  bolsinha: s(`
.kkk.
k...k
abbbc
abwbc
.ccc.
`, P(PINK)),

  // ---------------------------------------------------------------- costas
  capa: s(CAPE, P(RED)),
  'capa-estelar': s(`
.aaaaaaa.
abbybbbbc
abbbbbybc
abybcbbbc
abbcbbcbc
.bc.bc.c.
`, P(0x4a3a9a)),
  'capa-liga': s(`
.yyyyyyy.
abbbbbbbc
abbbebbbc
abbeeebbc
abbcbbcbc
.bc.bc.c.
`, P(GOLD, RED)),
  'capa-sobrevivente': s(`
.xxxxxxx.
abbbbbbbc
abbbybbbc
abbbcbbbc
abbcbbcbc
.bc.bc.c.
`, P(0x2a3fa8)),
  'capa-vampiro': s(`
aa.......aa
abaa...aaba
abbeeeeebba
.bbeeeeebb.
..ceeeeec..
`, P(0x3a3a4a, RED)),
  'manto-fantasma': s(`
.aaaaaa.
abbbbbbc
abbbbbbc
abbbbbbc
ab.bb.bc
a...b..c
`, P(LILAC)),
  asinhas: s(`
ww........ww
wwww....wwww
.vwwww.wwwv.
..vv....vv..
`, P(WHITE)),
  'asas-morcego': s(`
a..........a
ab........ba
abba.aa.abba
abbbbbbbbbbc
.b.c....c.b.
`, P(0x4a4458)),
  'asas-dragao': s(`
a...........a
ab.........ba
abde.....edba
abdeeb.beedbc
.bc.c...c.cb.
`, P(0x3a9858, 0xc8e070)),
  'asas-fada': s(`
aa.......aa
abba...abbc
.abbb.bbbc.
..ab...bc..
`, P(0xa8e8ff)),
  mochila: s(`
.aaaa.
abeeec
abeeec
abbbbc
.cccc.
`, P(0xe8a03a, 0xc8802a)),
  'mochila-pokebola': s(`
.aaaa.
abbbbc
kkwwkk
wwkkwv
.vvvv.
`, P(RED)),

  // ---------------------------------------------------------------- na mão
  'trofeu-torre': s(TROPHY, P(GOLD, BROWN)),
  'trofeu-pista': s(TROPHY, P(0x76d7ce, BROWN)),
  espada: s(`
.w.
wvw
wvw
wvw
wvw
tyt
.e.
.y.
`, P(0, 0x4878e8)),
  cimitarra: s(`
.w..
.wv.
..wv
..wv
.wv.
tyt.
.q..
`, P(0)),
  rosa: s(`
ab.
bc.
.q.
qq.
.qq
.q.
`, P(RED)),
  campanula: s(`
abb.
abbc
y.c.
..q.
.qq.
..q.
`, P(LILAC)),
  buque: s(`
ab.ed
bbeef
.pwp.
.ppp.
..d..
.d.d.
`, P(PINK, PURPLE)),
  microfone: s(`
ab
bc
ee
ee
ff
`, P(PINK, BLUE)),
  guitarra: s(`
.k..
.k..
.k..
abc.
.yc.
abbc
abwc
.cc.
`, P(RED)),
  'guarda-sol-mao': s(`
..a...
yybuux
yybbux
..k...
..k...
..k...
..k...
`, P(RED)),
  sombrinha: s(`
..a..
.abbc
abbbc
w.k.w
..k..
..k..
.rk..
`, P(RED)),
  frigideira: s(`
.aa....
abkbnnn
.cc....
`, P(BLACK)),
  cajado: s(`
.nn.
n..n
...n
...n
...n
...n
...n
`, P(BROWN)),
  raquete: s(`
.aaa.
awvwa
avwva
.aaa.
..e..
..e..
..e..
`, P(0xd04040, 0x3060c0)),
  'vara-pesca': s(`
....nk
...n.k
..n..k
.n...k
n....r
`, P(0)),
  tridente: s(`
a.a.a
abbbc
..b..
..b..
..b..
..c..
`, P(GOLD)),
  trompete: s(`
.a.a...
abababb
abbbbbb
.c.c.bc
`, P(GOLD)),
  'lanterna-papel': s(`
.k.
yyy
eee
eee
yyy
`, P(0, RED)),
  balao: s(`
.ab.
abbb
awbc
.bc.
..k.
.k..
..k.
`, P(RED)),
  livro: s(`
abbbbc
abwwbc
abbbbc
wwwwwv
`, P(0x3868c8)),
  martelo: s(`
aabbc
abbbc
..n..
..n..
..n..
..m..
`, P(SILVER)),
  presente: s(`
.y.y.
eeyee
bbybc
bbybc
ccycc
`, P(RED, 0xc02a2a)),
  'estrela-ninja': s(`
a...a
.abc.
.bkb.
.bcb.
c...c
`, P(SILVER)),
  varinha: s(`
.a.
awb
.c.
.k.
.k.
.k.
`, P(YELLOW)),
  leque: s(`
abdebde
.abdeb.
..abd..
...k...
`, P(PINK, PURPLE)),
};

/** Acessórios com arte (para conferir que todo acessório do catálogo tem desenho). */
export const ACCESSORY_SPRITE_IDS = Object.keys(ART);

function paint(id: string): PixelBuf {
  const sp = ART[id];
  if (!sp) return render(null, 1, 1);
  const lines = sp.rows.split('\n').filter((l) => l.trim().length > 0);
  const w = Math.max(...lines.map((l) => l.length)) + 2;
  const h = lines.length + 2;
  return crop(render((p: Pen) => p.map(1, 1, sp.rows, sp.pal), w, h, { shade: 'none', outline: sp.bare ? 'none' : 'ink' }));
}

const cache = new Map<string, PixelBuf>();

/** Desenho no tamanho real (pixels do tileset), recortado. */
export function paintAccessoryArt(id: string): PixelBuf {
  let buf = cache.get(id);
  if (!buf) {
    buf = paint(id);
    cache.set(id, buf);
  }
  return buf;
}

/** Ícone 16×16 (mochila, loja): o mesmo desenho, centralizado, sem ampliar (como no exemplo de referência). */
export function paintAccessoryIconArt(id: string): PixelBuf {
  return center(paintAccessoryArt(id), 16, 16);
}

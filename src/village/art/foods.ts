import { ic, Q, SHAPES } from './items';
import type { Icon } from './items';

/** Pratos da cozinha da Vila, no mesmo estilo dos ícones da mochila (ver `items.ts`). */

const { GLASS, BOWL, PLATE } = SHAPES;
const top = (rows: string, base: string): string => `${rows.trim()}\n${base.trim()}`;
const bowl = (topping: string, main: number, extra = 0) => ic(top(topping, BOWL), Q(main, extra || main));
const plate = (food: string, main: number, second = main) => ic(top(food, PLATE), Q(main, second));

const JAR = `
...TTTTTT...
..TUTTTTUT..
...KKKKKK...
..WabbbbcV..
..WaWWWWcV..
..WbWeeWcV..
..WbWWWWcV..
..WbbbcccV..
...VVVVVV...
`;
const LOAF = `
...abbbbc...
..abWbbbccd.
.abbbbbbbccd
.bbcbbcbbccd
.ccccccccddd
..dddddddd..
`;
const CAKE = `
.....RR.....
....RRWR....
...WWWWWWV..
..abbbbbbbc.
..eeeeeeeef.
..abbbbbbbc.
..eeeeeeeef.
..cccccccdd.
`;

const STEAM = `
....V...V....
.....V.V.....
`;

export const FOOD_ICON_ART: Record<string, Icon> = {
  // Antigos.
  'suco-oran': ic(GLASS, Q(0x4a6ae8, 0xe85040)),
  'suco-pecha': ic(GLASS, Q(0xf080b0, 0xe85040)),
  salada: bowl(`
...R..LM.....
..LMRMNLO....
`, 0x58b048),
  'sopa-abobora': bowl(STEAM, 0xf09030),
  'bolo-morango': ic(CAKE, Q(0xf8e0b0, 0xf8a8c8)),
  'torta-pecha': ic(`
....aa....
...abbc...
..abeebc..
.abeeffbc.
abbeffgbbc
dddddddddd
`, Q(0xe0b068, 0xf080b0)),
  'pao-mel': ic(LOAF, Q(0xd89848)),
  'peixe-grelhado': plate(`
..abbbbbc.ef.
.aKbcbcbccef.
..cccccccd.f.
`, 0xd89858),
  espetinho: ic(`
...........T
..........T.
........eeT.
.......effg.
......abbg..
.....abcd...
....eefd....
...efgg.....
..abbg......
.abcd.......
.Tdd........
T...........
`, Q(0xc89060, 0xe04838)),
  pipoca: ic(`
..W.WW.W....
.WWVWWVWW...
.WWWWWWWWV..
.RWRWRWRWR..
.RWRWRWRWR..
..RWRWRWR...
..RWRWRWR...
..RWRWRWR...
`, Q(0xf8f0d0)),
  geleia: ic(JAR, Q(0x8838c8, 0xf8f8f8)),
  'melancia-gelada': ic(`
abbbbbbbbbbc
aWbKbbbKbbcd
.bbbbKbbbcd.
..WWWWWWWV..
...MMMMMM...
....NNNN....
`, Q(0xe84858)),
  ensopado: bowl(`
....V...V....
...V...V.....
..OT..O.T....
`, 0x8a5a38),
  'lanche-pokebola': ic(`
...RRRRRR...
..RRWRRRRR..
.RRRRRRRRRR.
.KKKKWWKKKK.
.MMMMMMMMMM.
.RRRRRRRRRR.
.TTTTTTTTTT.
..TTTTTTTT..
`, Q(0)),
  // Novos.
  omelete: plate(`
...abbbbbc...
..abWbbbbbcd.
..bbbbbbbbcd.
...ccRcccdd..
`, 0xf8d850),
  panqueca: ic(`
....ZZZZ....
...aYYYYc...
..abbbbbbcd.
..dddddddd..
..abbbbbbcd.
..dddddddd..
..abbbbbbcd.
..dddddddd..
`, Q(0xe8b060)),
  pao: ic(`
..........abc
........abbcd
......abbbcd.
....abbcbcd..
..abbcbcdd...
.abbbbcdd....
.ccccdd......
`, Q(0xd8a050)),
  sanduiche: ic(`
...abbbbbc..
..abbbbbbbc.
..RRRRRRRRR.
..MMMMMMMMN.
..ccccccccd.
...ddddddd..
`, Q(0xe8c080)),
  pizza: ic(`
abbbbbbbbbc
.aRbbbRbbc.
..bbRbbbc..
...bbbRc...
....bbc....
.....c.....
`, Q(0xf8d060)),
  onigiri: ic(`
.....WW.....
....WWWV....
...WWWWWV...
..WWWWWWWV..
.WWWWWWWWVV.
.WWKKKKKVVV.
..VKKKKKVV..
`, Q(0)),
  curry: plate(`
..WWWWabbc..
.WWWWabbbcd.
.WWWWbbObcd.
..WWWccccd..
`, 0xd88830),
  'curry-doce': plate(`
..WWWWabbc..
.WWWWabPbcd.
.WWWWbbbbcd.
..WWWccccd..
`, 0xe8b058),
  'curry-picante': plate(`
..WWWWabbc..
.WWWWaRbbcd.
.WWWWbbRbcd.
..WWWccccd..
`, 0xc84020),
  sorvete: ic(`
....abbc....
...abWbcd...
...bbbbcd...
...ddddd....
...efefe....
....fef.....
....efe.....
.....f......
`, Q(0xf8f0d8, 0xd8a058)),
  'cookie-lava': ic(`
....abbbc...
..abbcbbbcd.
.abWbbbcbcd.
.abbcbbbbcd.
.bbbbbcbccd.
..cccccccd..
...dddddd...
`, Q(0xc85838)),
  'gateau-velho': ic(`
....W.W.....
..aWWWWWbc..
.abbbbbbbbc.
.eeeeeeeeef.
.abbbbbbbcd.
.cccccccccd.
`, Q(0x8a5030, 0xf8e8c8)),
  'barra-raiva': ic(`
..e.........
.ef.........
.abbbbbbbbc.
.abWbbbbbcd.
.bbbbbbbbcd.
.ccccccccdd.
.........ef.
.........f..
`, Q(0xd84040, 0xf8c840)),
  galette: ic(`
....abbbc...
..abbbbbbcd.
.abWbYbbbcd.
.abbYYYbbcd.
.bbbbYbbccd.
..cccccccd..
`, Q(0xe8b878)),
  sable: ic(`
..abbbbc....
.abbWbbbc...
.cccccccd...
..abbbbbbc..
.abbbbbbbbc.
.cccccccccd.
`, Q(0xf0c878)),
  malassada: ic(`
...abbbbc...
..aWVbbVbc..
.abVbbbVbcd.
.abbbKKbbcd.
.bbVbKKbVcd.
.bbbbbbbbcd.
..ccccccdd..
`, Q(0xe8a858)),
  'crocante-pewter': bowl(`
...T.Z.T.....
..ZTZTZTZ....
`, 0xd8b068),
  pudim: ic(`
....dddd....
...cddddc...
..abbbbbbc..
..abWbbbbc..
.abbbbbbbcd.
.bbbbbbbbcd.
WWWWWWWWWWWV
.VVVVVVVVVV.
`, Q(0xf8d870)),
  crepe: ic(`
....RRW.....
...RWRWR....
...abbbbc...
....abbc....
....bbcd....
.....bc.....
.....cd.....
`, Q(0xf0c890)),
  waffle: ic(`
.....YY.....
.abbbbbbbbc.
.bcbcbcbcbd.
.bbbbbbbbbd.
.bcbcbcbcbd.
.bbbbbbbbbd.
.bcbcbcbcbd.
.cdddddddd..
`, Q(0xe8b060)),
  'cha-ervas': ic(`
....M.V.....
...V.V......
.WVVVVVVVW..
.WabbbbbcVVV
.WbbbbbccV.V
..WbbbccVVV.
...WWWWVV...
.VVVVVVVVVV.
`, Q(0x88b848)),
  vitamina: ic(GLASS, Q(0xf8a0b0, 0x58c058)),
  'suco-sitrus': ic(GLASS, Q(0xf8d030, 0x58c058)),
  'refresco-lum': ic(GLASS, Q(0x68d068, 0xe85040)),
  'geleia-razz': ic(JAR, Q(0xd83848, 0xf8f8f8)),
  'salada-frutas': bowl(`
...Y..R.P....
..YYRRPPOO...
`, 0xf8e8a0),
  broa: ic(LOAF, Q(0xf0c848)),
  'sopa-cebola': bowl(STEAM, 0xc89048),
  'creme-beterraba': bowl(STEAM, 0xb02860),
  risoto: bowl(`
...T....T....
..TUT..TUT...
`, 0xf0e0b0),
  'pimentao-recheado': ic(`
...WVWW.....
..WWVWWV....
..abbcbbc...
.abWbcbbcd..
.abbbcbbcd..
.bbbbcbbcd..
..bbbcbcd...
...ccdcd....
`, Q(0x58b048)),
  'batata-frita': ic(`
..Y.YY.Y....
.YZYYZYYZ...
.YYZYYZYZ...
.RRRRRRRR...
.RWWRRWWR...
..RRRRRR....
..RRRRRR....
`, Q(0)),
  pure: plate(`
.....Y......
...abbbc....
..abbbbbc...
.abbbbbbcd..
`, 0xf8e8b0),
  'peixe-ervas': plate(`
..abbbbbc.ef.
.aKbcbcbccef.
..cMcMccMd.f.
`, 0xe0a868),
  sushi: ic(`
...efefef...
..eeeeeeef..
..WWWWWWWV..
.WWWWWWWWVV.
..KKKKKKKK..
`, Q(0, 0xf89868)),
  'caranguejo-cozido': plate(`
..ab.....ab..
.abc.KK.Kbc..
..abbbbbbbc..
.abbbbbbbbcd.
`, 0xe86040),
  'lula-grelhada': ic(`
..........T.
.........T..
....abbbcT..
...abWbbcd..
...abbbbcd..
..TbKbbKcd..
.T.bbbbbcd..
T..b.c.c.d..
`, Q(0xe8b0a0)),
  'bolo-persim': ic(CAKE, Q(0xf8d8a8, 0xf88858)),
  poffin: ic(`
....abbc....
..abWbbbcd..
.abbbbbbbcd.
.bbbbbbbbcd.
.eeeeeeeeef.
..efefefef..
..ffffffff..
`, Q(0xf890b8, 0xf8f0e0)),
  pokebloco: ic(`
...aaaab....
..abbbbbc...
.aWbbbbcd...
.abbbbbcd...
.bbbbbccd...
.cccccdd....
`, Q(0x58b8e8)),
  'leite-quente': ic(`
....V..V....
.....V..V...
..WWWWWWV...
..WbbbbbVVV.
..WbbbbbV.V.
..WbbbbbVVV.
..WbbbbbV...
...VVVVV....
`, Q(0xf8f0e0)),
};

import { TYPE_COLORS } from './pokemon-data';
import type { PokemonType } from './pokemon-data';

/**
 * A Liga: 8 Ginásios em ordem, depois a Elite 4 em sequência e a Campeã. Os líderes e as equipes seguem a região de
 * Sinnoh (os sprites são os de Diamond/Pearl do repositório de sprites do Showdown). Cada vitória num Ginásio dá a
 * insígnia; a Elite 4 é uma corrida: perder para qualquer um volta ao começo dela, como nos jogos.
 * As batalhas acontecem na Caixa, em revezamento (um duelo por vez), contra a equipe do líder.
 */

/** Nomes das espécies das equipes dos líderes (iguais em português). */
export const SPECIES_NAMES: Readonly<Record<number, string>> = {
  16: 'Pidgey',
  17: 'Pidgeotto',
  18: 'Pidgeot',
  25: 'Pikachu',
  24: 'Arbok',
  31: 'Nidoqueen',
  34: 'Nidoking',
  35: 'Clefairy',
  42: 'Golbat',
  45: 'Vileplume',
  49: 'Venomoth',
  51: 'Dugtrio',
  54: 'Psyduck',
  57: 'Primeape',
  58: 'Growlithe',
  59: 'Arcanine',
  62: 'Poliwrath',
  64: 'Kadabra',
  71: 'Victreebel',
  77: 'Ponyta',
  80: 'Slowbro',
  81: 'Magnemite',
  82: 'Magneton',
  86: 'Seel',
  87: 'Dewgong',
  89: 'Muk',
  92: 'Gastly',
  100: 'Voltorb',
  103: 'Exeggutor',
  106: 'Hitmonlee',
  107: 'Hitmonchan',
  109: 'Koffing',
  110: 'Weezing',
  111: 'Rhyhorn',
  112: 'Rhydon',
  114: 'Tangela',
  119: 'Seaking',
  120: 'Staryu',
  121: 'Starmie',
  123: 'Scyther',
  124: 'Jynx',
  131: 'Lapras',
  138: 'Omanyte',
  142: 'Aerodactyl',
  148: 'Dragonair',
  149: 'Dragonite',
  6: 'Charizard',
  163: 'Hoothoot',
  168: 'Ariados',
  169: 'Crobat',
  178: 'Xatu',
  197: 'Umbreon',
  198: 'Murkrow',
  203: 'Girafarig',
  205: 'Forretress',
  227: 'Skarmory',
  230: 'Kingdra',
  237: 'Hitmontop',
  241: 'Miltank',
  262: 'Mightyena',
  275: 'Shiftry',
  277: 'Swellow',
  279: 'Pelipper',
  288: 'Vigoroth',
  289: 'Slaking',
  296: 'Makuhita',
  299: 'Nosepass',
  302: 'Sableye',
  306: 'Aggron',
  310: 'Manectric',
  319: 'Sharpedo',
  322: 'Numel',
  324: 'Torkoal',
  327: 'Spinda',
  330: 'Flygon',
  332: 'Cacturne',
  334: 'Altaria',
  337: 'Lunatone',
  338: 'Solrock',
  344: 'Claydol',
  346: 'Cradily',
  348: 'Armaldo',
  354: 'Banette',
  356: 'Dusclops',
  359: 'Absol',
  362: 'Glalie',
  364: 'Sealeo',
  365: 'Walrein',
  370: 'Luvdisc',
  372: 'Shelgon',
  373: 'Salamence',
  376: 'Metagross',
  11: 'Metapod',
  14: 'Kakuna',
  218: 'Slugma',
  91: 'Cloyster',
  74: 'Geodude',
  95: 'Onix',
  408: 'Cranidos',
  420: 'Cherubi',
  387: 'Turtwig',
  407: 'Roserade',
  307: 'Meditite',
  67: 'Machoke',
  448: 'Lucario',
  130: 'Gyarados',
  195: 'Quagsire',
  419: 'Floatzel',
  355: 'Duskull',
  93: 'Haunter',
  429: 'Mismagius',
  436: 'Bronzor',
  208: 'Steelix',
  411: 'Bastiodon',
  215: 'Sneasel',
  221: 'Piloswine',
  460: 'Abomasnow',
  478: 'Froslass',
  26: 'Raichu',
  424: 'Ambipom',
  224: 'Octillery',
  405: 'Luxray',
  469: 'Yanmega',
  212: 'Scizor',
  416: 'Vespiquen',
  214: 'Heracross',
  452: 'Drapion',
  340: 'Whiscash',
  472: 'Gliscor',
  450: 'Hippowdon',
  76: 'Golem',
  464: 'Rhyperior',
  229: 'Houndoom',
  136: 'Flareon',
  78: 'Rapidash',
  392: 'Infernape',
  467: 'Magmortar',
  122: 'Mr. Mime',
  196: 'Espeon',
  437: 'Bronzong',
  65: 'Alakazam',
  475: 'Gallade',
  442: 'Spiritomb',
  468: 'Togekiss',
  350: 'Milotic',
  445: 'Garchomp',
  // Espécies extras das equipes cheias dos Ginásios (6 Pokémon cada).
  10: 'Caterpie',
  12: 'Butterfree',
  15: 'Beedrill',
  21: 'Spearow',
  22: 'Fearow',
  28: 'Sandslash',
  37: 'Vulpix',
  39: 'Jigglypuff',
  40: 'Wigglytuff',
  47: 'Parasect',
  55: 'Golduck',
  56: 'Mankey',
  96: 'Drowzee',
  97: 'Hypno',
  101: 'Electrode',
  102: 'Exeggcute',
  113: 'Chansey',
  116: 'Horsea',
  117: 'Seadra',
  125: 'Electabuzz',
  126: 'Magmar',
  141: 'Kabutops',
  147: 'Dratini',
  164: 'Noctowl',
  200: 'Misdreavus',
  202: 'Wobbuffet',
  264: 'Linoone',
  276: 'Taillow',
  282: 'Gardevoir',
  287: 'Slakoth',
  297: 'Hariyama',
  304: 'Aron',
  309: 'Electrike',
  323: 'Camerupt',
  335: 'Zangoose',
  353: 'Shuppet',
  75: 'Graveler',
  409: 'Rampardos',
  388: 'Grotle',
  389: 'Torterra',
  421: 'Cherrim',
  66: 'Machop',
  68: 'Machamp',
  308: 'Medicham',
  418: 'Buizel',
  423: 'Gastrodon',
  457: 'Lumineon',
  94: 'Gengar',
  426: 'Drifblim',
  477: 'Dusknoir',
  462: 'Magnezone',
  476: 'Probopass',
  461: 'Weavile',
  473: 'Mamoswine',
  403: 'Shinx',
  404: 'Luxio',
  135: 'Jolteon',
  466: 'Electivire',
  // Elite 4 completas (6 Pokémon) e as Ligas de Unova e Kalos.
  70: 'Weepinbell',
  185: 'Sudowoodo',
  189: 'Jumpluff',
  199: 'Slowking',
  267: 'Beautifly',
  283: 'Surskit',
  284: 'Masquerain',
  303: 'Mawile',
  342: 'Crawdaunt',
  361: 'Snorunt',
  363: 'Spheal',
  371: 'Bagon',
  504: 'Patrat',
  505: 'Watchog',
  506: 'Lillipup',
  507: 'Herdier',
  508: 'Stoutland',
  510: 'Liepard',
  511: 'Pansage',
  512: 'Simisage',
  513: 'Pansear',
  514: 'Simisear',
  515: 'Panpour',
  516: 'Simipour',
  518: 'Musharna',
  519: 'Pidove',
  520: 'Tranquill',
  521: 'Unfezant',
  522: 'Blitzle',
  523: 'Zebstrika',
  527: 'Woobat',
  528: 'Swoobat',
  529: 'Drilbur',
  530: 'Excadrill',
  531: 'Audino',
  533: 'Gurdurr',
  534: 'Conkeldurr',
  536: 'Palpitoad',
  538: 'Throh',
  539: 'Sawk',
  541: 'Swadloon',
  542: 'Leavanny',
  543: 'Venipede',
  545: 'Scolipede',
  551: 'Sandile',
  552: 'Krokorok',
  553: 'Krookodile',
  557: 'Dwebble',
  558: 'Crustle',
  560: 'Scrafty',
  561: 'Sigilyph',
  562: 'Yamask',
  563: 'Cofagrigus',
  571: 'Zoroark',
  576: 'Gothitelle',
  579: 'Reuniclus',
  581: 'Swanna',
  582: 'Vanillite',
  583: 'Vanillish',
  584: 'Vanilluxe',
  587: 'Emolga',
  589: 'Escavalier',
  592: 'Frillish',
  593: 'Jellicent',
  595: 'Joltik',
  596: 'Galvantula',
  604: 'Eelektross',
  606: 'Beheeyem',
  609: 'Chandelure',
  610: 'Axew',
  611: 'Fraxure',
  612: 'Haxorus',
  613: 'Cubchoo',
  614: 'Beartic',
  615: 'Cryogonal',
  617: 'Accelgor',
  620: 'Mienshao',
  621: 'Druddigon',
  623: 'Golurk',
  625: 'Bisharp',
  626: 'Bouffalant',
  630: 'Mandibuzz',
  635: 'Hydreigon',
  637: 'Volcarona',
  655: 'Delphox',
  658: 'Greninja',
  663: 'Talonflame',
  664: 'Scatterbug',
  665: 'Spewpa',
  666: 'Vivillon',
  668: 'Pyroar',
  672: 'Skiddo',
  673: 'Gogoat',
  675: 'Pangoro',
  677: 'Espurr',
  678: 'Meowstic',
  680: 'Doublade',
  681: 'Aegislash',
  683: 'Aromatisse',
  685: 'Slurpuff',
  689: 'Barbaracle',
  691: 'Dragalge',
  693: 'Clawitzer',
  694: 'Helioptile',
  695: 'Heliolisk',
  696: 'Tyrunt',
  697: 'Tyrantrum',
  698: 'Amaura',
  699: 'Aurorus',
  700: 'Sylveon',
  701: 'Hawlucha',
  702: 'Dedenne',
  703: 'Carbink',
  706: 'Goodra',
  707: 'Klefki',
  709: 'Trevenant',
  711: 'Gourgeist',
  712: 'Bergmite',
  713: 'Avalugg',
  715: 'Noivern',
  546: 'Cottonee',
  548: 'Petilil',
  556: 'Maractus',
  619: 'Mienfoo',
  654: 'Braixen',
  667: 'Litleo',
  674: 'Pancham',
  679: 'Honedge',
  682: 'Spritzee',
  688: 'Binacle',
  692: 'Clauncher',
  708: 'Phantump',
  714: 'Noibat',
  // Alola, Galar e Paldea.
  20: 'Raticate',
  38: 'Ninetales',
  53: 'Persian',
  73: 'Tentacruel',
  105: 'Marowak',
  128: 'Tauros',
  143: 'Snorlax',
  171: 'Lanturn',
  184: 'Azumarill',
  210: 'Granbull',
  213: 'Shuckle',
  216: 'Teddiursa',
  217: 'Ursaring',
  232: 'Donphan',
  235: 'Smeargle',
  369: 'Relicanth',
  398: 'Staraptor',
  435: 'Skuntank',
  454: 'Toxicroak',
  526: 'Gigalith',
  537: 'Seismitoad',
  549: 'Lilligant',
  555: 'Darmanitan',
  628: 'Braviary',
  671: 'Florges',
  676: 'Furfrou',
  687: 'Malamar',
  727: 'Incineroar',
  730: 'Primarina',
  733: 'Toucannon',
  734: 'Yungoos',
  735: 'Gumshoos',
  737: 'Charjabug',
  738: 'Vikavolt',
  739: 'Crabrawler',
  740: 'Crabominable',
  741: 'Oricorio',
  743: 'Ribombee',
  745: 'Lycanroc',
  746: 'Wishiwashi',
  748: 'Toxapex',
  750: 'Mudsdale',
  752: 'Araquanid',
  754: 'Lurantis',
  756: 'Shiinotic',
  757: 'Salandit',
  758: 'Salazzle',
  760: 'Bewear',
  761: 'Bounsweet',
  762: 'Steenee',
  763: 'Tsareena',
  764: 'Comfey',
  770: 'Palossand',
  771: 'Pyukumuku',
  775: 'Komala',
  776: 'Turtonator',
  777: 'Togedemaru',
  778: 'Mimikyu',
  781: 'Dhelmise',
  812: 'Rillaboom',
  823: 'Corviknight',
  829: 'Gossifleur',
  830: 'Eldegoss',
  833: 'Chewtle',
  834: 'Drednaw',
  838: 'Carkol',
  839: 'Coalossal',
  840: 'Applin',
  841: 'Flapple',
  842: 'Appletun',
  844: 'Sandaconda',
  845: 'Cramorant',
  846: 'Arrokuda',
  847: 'Barraskewda',
  849: 'Toxtricity',
  850: 'Sizzlipede',
  851: 'Centiskorch',
  853: 'Grapploct',
  855: 'Polteageist',
  858: 'Hatterene',
  861: 'Grimmsnarl',
  862: 'Obstagoon',
  865: "Sirfetch'd",
  866: 'Mr. Rime',
  867: 'Runerigus',
  869: 'Alcremie',
  873: 'Frosmoth',
  874: 'Stonjourner',
  875: 'Eiscue',
  877: 'Morpeko',
  879: 'Copperajah',
  884: 'Duraludon',
  887: 'Dragapult',
  917: 'Tarountula',
  918: 'Spidops',
  919: 'Nymble',
  920: 'Lokix',
  928: 'Smoliv',
  929: 'Dolliv',
  930: 'Arboliva',
  939: 'Bellibolt',
  940: 'Wattrel',
  941: 'Kilowattrel',
  956: 'Espathra',
  959: 'Tinkaton',
  960: 'Wiglett',
  961: 'Wugtrio',
  970: 'Glimmora',
  971: 'Greavard',
  972: 'Houndstone',
  973: 'Flamigo',
  974: 'Cetoddle',
  975: 'Cetitan',
  976: 'Veluza',
  980: 'Clodsire',
  981: 'Farigiraf',
  982: 'Dudunsparce',
  983: 'Kingambit',
  998: 'Baxcalibur',
};

export const speciesName = (dex: number): string => SPECIES_NAMES[dex] ?? `Pokémon nº ${dex}`;

export type ChallengeKind = 'gym' | 'elite' | 'champion';

export interface Challenge {
  id: string;
  region?: RegionId;
  kind: ChallengeKind;
  /** Ordem dentro do tipo (Ginásio 0..7, Elite 0..3, Campeã 0). */
  order: number;
  leader: string;
  /** Título curto ("Líder de Ginásio", "Elite 4", "Campeã"). */
  role: string;
  /** Caminho do sprite (ver `trainerSpriteUrl`). */
  sprite: string;
  type: PokemonType | null;
  /** Equipe do líder, números da Pokédex. */
  team: readonly number[];
  /** Os atributos da equipe do líder são multiplicados por isto (os desafios ficam mais difíceis). */
  power: number;
  badge?: { name: string; color: string };
  /** XP (e as mesmas moedas) da primeira vitória. */
  xp: number;
  intro: string;
  defeat: string;
}

const DP = 'gen4/diamond-pearl/';

export const GYMS: readonly Challenge[] = [
  { id: 'gym-0', kind: 'gym', order: 0, leader: 'Roark', role: 'Líder de Ginásio', sprite: `${DP}Roark`, type: 'rock', team: [74, 75, 76, 95, 408, 409], power: 0.9, badge: { name: 'Insígnia Carvão', color: '#8a8070' }, xp: 120, intro: 'Meus Pokémon de pedra são duros como a mina onde trabalho. Vamos ver do que você é feito!', defeat: 'Você rachou a minha defesa! Leve a Insígnia Carvão, você mereceu.' },
  { id: 'gym-1', kind: 'gym', order: 1, leader: 'Gardenia', role: 'Líder de Ginásio', sprite: `${DP}Gardenia`, type: 'grass', team: [387, 388, 389, 420, 421, 407], power: 0.95, badge: { name: 'Insígnia Floresta', color: '#4caf50' }, xp: 130, intro: 'Meus Pokémon de grama crescem fortes ao sol. Preparado para ser enraizado?', defeat: 'Que florada de batalha! A Insígnia Floresta é sua.' },
  { id: 'gym-2', kind: 'gym', order: 2, leader: 'Maylene', role: 'Líder de Ginásio', sprite: `${DP}Maylene`, type: 'fighting', team: [66, 67, 68, 307, 308, 448], power: 1.0, badge: { name: 'Insígnia Pedregulho', color: '#c0504d' }, xp: 140, intro: 'Treino descalça na neve todos os dias. Mostre a força do seu coração!', defeat: 'Seus Pokémon lutaram com tudo. A Insígnia Pedregulho é sua!' },
  { id: 'gym-3', kind: 'gym', order: 3, leader: 'Crasher Wake', role: 'Líder de Ginásio', sprite: `${DP}Crasher_Wake`, type: 'water', team: [130, 195, 418, 419, 423, 457], power: 1.05, badge: { name: 'Insígnia Pântano', color: '#3a8fe0' }, xp: 150, intro: 'Uma onda gigante está chegando! Segure firme ou vai ser levado!', defeat: 'Que tsunami de talento! Tome a Insígnia Pântano!' },
  { id: 'gym-4', kind: 'gym', order: 4, leader: 'Fantina', role: 'Líder de Ginásio', sprite: `${DP}Fantina`, type: 'ghost', team: [93, 94, 355, 429, 426, 477], power: 1.1, badge: { name: 'Insígnia Relíquia', color: '#7e57c2' }, xp: 160, intro: 'Meus Pokémon fantasmas dançam no escuro. Você consegue acompanhar?', defeat: 'Magnífique! Você dança muito bem. A Insígnia Relíquia é sua.' },
  { id: 'gym-5', kind: 'gym', order: 5, leader: 'Byron', role: 'Líder de Ginásio', sprite: `${DP}Byron`, type: 'steel', team: [208, 411, 436, 437, 462, 476], power: 1.15, badge: { name: 'Insígnia Mina', color: '#90a4ae' }, xp: 170, intro: 'Aço forjado na mina! Nenhum golpe vai amassar meus Pokémon!', defeat: 'Amassou o aço! Você é de ferro. Leve a Insígnia Mina.' },
  { id: 'gym-6', kind: 'gym', order: 6, leader: 'Candice', role: 'Líder de Ginásio', sprite: `${DP}Candice`, type: 'ice', team: [215, 461, 221, 473, 460, 478], power: 1.2, badge: { name: 'Insígnia Pingente', color: '#80deea' }, xp: 180, intro: 'Foco total! Meus Pokémon de gelo vão congelar sua equipe inteira!', defeat: 'Você derreteu meu gelo com a sua garra. A Insígnia Pingente é sua!' },
  { id: 'gym-7', kind: 'gym', order: 7, leader: 'Volkner', role: 'Líder de Ginásio', sprite: `${DP}Volkner`, type: 'electric', team: [403, 404, 405, 26, 135, 466], power: 1.25, badge: { name: 'Insígnia Farol', color: '#ffcb05' }, xp: 200, intro: 'Faz tempo que ninguém me dá um choque de verdade. Mostre essa faísca!', defeat: 'Finalmente uma batalha elétrica! A Insígnia Farol é sua. A Liga espera por você.' },
];

export const ELITE: readonly Challenge[] = [
  { id: 'elite-0', kind: 'elite', order: 0, leader: 'Aaron', role: 'Elite 4', sprite: `${DP}Aaron`, type: 'bug', team: [267, 469, 212, 416, 214, 452], power: 1.3, xp: 220, intro: 'Os Pokémon inseto são lindos e fortes. Vou provar isso agora!', defeat: 'Você venceu com elegância. Siga em frente, a Bertha espera.' },
  { id: 'elite-1', kind: 'elite', order: 1, leader: 'Bertha', role: 'Elite 4', sprite: `${DP}Bertha`, type: 'ground', team: [185, 340, 472, 450, 76, 464], power: 1.34, xp: 230, intro: 'Ah, que jovem animado! Vamos ver se você aguenta o tremor da terra.', defeat: 'Que maravilha! Faz tempo que não me divirto tanto. Vá, querido.' },
  { id: 'elite-2', kind: 'elite', order: 2, leader: 'Flint', role: 'Elite 4', sprite: `${DP}Flint`, type: 'fire', team: [229, 136, 78, 59, 392, 467], power: 1.38, xp: 240, intro: 'Meu fogo queima mais quente que qualquer coisa! Vamos acender essa batalha!', defeat: 'Você apagou minhas chamas... mas acendeu meu coração. Siga!' },
  { id: 'elite-3', kind: 'elite', order: 3, leader: 'Lucian', role: 'Elite 4', sprite: `${DP}Lucian`, type: 'psychic', team: [122, 203, 196, 437, 65, 475], power: 1.42, xp: 250, intro: 'Estava terminando um livro. Imagino que nossa batalha será um capítulo melhor.', defeat: 'Que final brilhante. A Campeã aguarda na próxima sala.' },
];

export const CHAMPION: Challenge = {
  id: 'champion', kind: 'champion', order: 0, leader: 'Cynthia', role: 'Campeã', sprite: `${DP}Cynthia`, type: null, team: [442, 407, 468, 448, 350, 445], power: 1.5, xp: 500,
  intro: 'Eu sou a Campeã. Vou dar tudo de mim, como os meus Pokémon dão tudo por mim.',
  defeat: 'Você é o novo Campeão! Seu nome e o de seus Pokémon vão para o Hall da Fama.',
};

export type RegionId = 'sinnoh' | 'kanto' | 'johto' | 'hoenn' | 'unova' | 'kalos' | 'alola' | 'galar' | 'paldea';
export interface LeagueRegion {
  id: RegionId;
  name: string;
  generation: string;
  badgeOffset: number;
  gyms: readonly Challenge[];
  elite: readonly Challenge[];
  champion: Challenge;
}

// Equipes de exibição inspiradas em FireRed/LeafGreen, HeartGold/SoulSilver, Ruby/Sapphire, Black/White, X/Y, Sun/Moon,
// Sword/Shield e Scarlet/Violet (Alola e Galar não têm Elite 4 nos jogos: o app usa kahunas/capitães e o Campeonato).
// Todos os treinadores levam 6 Pokémon; a progressão e a dificuldade são próprias do app, como em Sinnoh.
type LeaderData = readonly [string, PokemonType, readonly number[], string?, string?];
function makeRegion(id: RegionId, name: string, generation: string, badgeOffset: number, spriteBase: string, gyms: readonly LeaderData[], elite: readonly LeaderData[], champion: LeaderData, championRole = 'Campeão'): LeagueRegion {
  const make = (data: LeaderData, kind: ChallengeKind, order: number): Challenge => {
    const [leader, type, team, badge, sprite] = data;
    const role = kind === 'gym' ? 'Líder de Ginásio' : kind === 'elite' ? 'Elite 4' : championRole;
    return { id: `${id}-${kind}-${order}`, region: id, kind, order, leader, role,
      sprite: `${spriteBase}${sprite ?? leader.replaceAll(' ', '_')}`, type, team,
      power: kind === 'gym' ? 0.9 + order * 0.05 : kind === 'elite' ? 1.3 + order * 0.04 : 1.5,
      xp: kind === 'gym' ? 120 + order * 10 : kind === 'elite' ? 220 + order * 10 : 500,
      ...(badge ? { badge: { name: `Insígnia ${badge}`, color: TYPE_COLORS[type] } } : {}),
      intro: `Sou ${leader}, da Liga de ${name}. Minha equipe está pronta para o seu desafio!`,
      defeat: kind === 'gym' ? `Uma ótima batalha! A Insígnia ${badge} é sua.` : `Você venceu minha equipe! Continue sua jornada pela Liga de ${name}.`,
    };
  };
  return { id, name, generation, badgeOffset, gyms: gyms.map((d, i) => make(d, 'gym', i)), elite: elite.map((d, i) => make(d, 'elite', i)), champion: make(champion, 'champion', 0) };
}

/**
 * Kalos, Alola, Galar e Paldea não têm sprites de treinador no repositório da Smogon: usam os do servidor do Pokémon
 * Showdown (endereço completo; `trainerSpriteUrl` aceita os dois). Kalos conferido em 2026-10-24; Alola, Galar e Paldea
 * ainda precisam ser conferidos fora do sandbox (o proxy bloqueia o Showdown).
 */
const SHOWDOWN_SPRITES = 'https://play.pokemonshowdown.com/sprites/trainers/';

export const LEAGUE_REGIONS: readonly LeagueRegion[] = [
  { id: 'sinnoh', name: 'Sinnoh', generation: 'IV', badgeOffset: 0, gyms: GYMS, elite: ELITE, champion: CHAMPION },
  makeRegion('kanto', 'Kanto', 'I', 8, 'gen3/firered-leafgreen/', [
    ['Brock', 'rock', [74, 95, 138, 141, 142, 76], 'Rocha'],
    ['Misty', 'water', [120, 121, 54, 55, 116, 117], 'Cascata'],
    ['Lt. Surge', 'electric', [100, 25, 26, 125, 82, 101], 'Trovão', 'Lt._Surge'],
    ['Erika', 'grass', [71, 114, 45, 102, 103, 47], 'Arco-íris'],
    ['Koga', 'poison', [109, 89, 110, 49, 24, 168], 'Alma'],
    ['Sabrina', 'psychic', [64, 122, 49, 65, 96, 97], 'Pântano'],
    ['Blaine', 'fire', [58, 77, 78, 59, 126, 37], 'Vulcão'],
    ['Giovanni', 'ground', [111, 51, 31, 34, 112, 28], 'Terra'],
  ], [
    ['Lorelei', 'ice', [87, 91, 80, 221, 124, 131]],
    ['Bruno', 'fighting', [95, 57, 62, 107, 106, 68]],
    ['Agatha', 'ghost', [92, 42, 93, 24, 110, 94]],
    ['Lance', 'dragon', [147, 148, 130, 142, 6, 149]],
  ], ['Blue', 'normal', [18, 65, 112, 103, 130, 6]]),
  makeRegion('johto', 'Johto', 'II', 16, 'gen4/heartgold-soulsilver/', [
    ['Falkner', 'flying', [16, 17, 163, 164, 21, 22], 'Zephyr'],
    ['Bugsy', 'bug', [11, 14, 123, 10, 12, 15], 'Colmeia'],
    ['Whitney', 'normal', [35, 241, 203, 39, 40, 113], 'Planície'],
    ['Morty', 'ghost', [92, 93, 94, 200, 353, 354], 'Névoa'],
    ['Chuck', 'fighting', [57, 62, 237, 56, 106, 107], 'Tempestade'],
    ['Jasmine', 'steel', [81, 82, 208, 205, 227, 304], 'Mineral'],
    ['Pryce', 'ice', [86, 87, 221, 124, 91, 131], 'Geleira'],
    ['Clair', 'dragon', [148, 130, 230, 147, 149, 334], 'Ascendente'],
  ], [
    ['Will', 'psychic', [178, 124, 103, 80, 122, 196]],
    ['Koga', 'poison', [168, 205, 89, 49, 110, 169]],
    ['Bruno', 'fighting', [237, 57, 106, 107, 95, 68]],
    ['Karen', 'dark', [197, 215, 45, 94, 198, 229]],
  ], ['Lance', 'dragon', [130, 149, 142, 6, 148, 230]]),
  makeRegion('hoenn', 'Hoenn', 'III', 24, 'gen3/ruby-sapphire/', [
    ['Roxanne', 'rock', [74, 299, 75, 76, 95, 306], 'Pedra'],
    ['Brawly', 'fighting', [66, 307, 296, 67, 68, 297], 'Punho'],
    ['Wattson', 'electric', [100, 81, 82, 310, 309, 125], 'Dínamo'],
    ['Flannery', 'fire', [218, 322, 324, 323, 126, 78], 'Calor'],
    ['Norman', 'normal', [327, 288, 289, 287, 264, 335], 'Equilíbrio'],
    ['Winona', 'flying', [277, 279, 227, 334, 276, 142], 'Pena'],
    ['Tate e Liza', 'psychic', [344, 178, 337, 338, 202, 282], 'Mente', 'Tate_and_Liza'],
    ['Wallace', 'water', [370, 340, 364, 119, 350, 121], 'Chuva'],
  ], [
    ['Sidney', 'dark', [262, 275, 332, 342, 319, 359]],
    ['Phoebe', 'ghost', [353, 355, 302, 200, 354, 356]],
    ['Glacia', 'ice', [361, 363, 362, 364, 131, 365]],
    ['Drake', 'dragon', [371, 372, 334, 330, 230, 373]],
  ], ['Steven', 'steel', [227, 344, 306, 346, 348, 376]]),
  makeRegion('unova', 'Unova', 'V', 32, 'gen5/black-white/', [
    ['Cilan', 'grass', [506, 511, 512, 546, 548, 556], 'Trio'],
    ['Lenora', 'normal', [504, 505, 506, 507, 508, 531], 'Básica'],
    ['Burgh', 'bug', [541, 543, 557, 545, 558, 542], 'Inseto'],
    ['Elesa', 'electric', [522, 587, 595, 596, 604, 523], 'Raio'],
    ['Clay', 'ground', [529, 536, 551, 552, 553, 530], 'Tremor'],
    ['Skyla', 'flying', [519, 520, 527, 528, 581, 521], 'Jato'],
    ['Brycen', 'ice', [582, 583, 613, 615, 584, 614], 'Congelante'],
    ['Drayden', 'dragon', [610, 611, 621, 334, 635, 612], 'Lenda'],
  ], [
    ['Shauntal', 'ghost', [562, 563, 592, 593, 623, 609]],
    ['Grimsley', 'dark', [510, 553, 560, 630, 571, 625]],
    ['Caitlin', 'psychic', [518, 561, 576, 606, 579, 282]],
    ['Marshal', 'fighting', [533, 538, 539, 560, 620, 534]],
  ], ['Alder', 'bug', [617, 626, 621, 584, 589, 637]]),
  makeRegion('kalos', 'Kalos', 'VI', 40, SHOWDOWN_SPRITES, [
    ['Viola', 'bug', [283, 664, 665, 284, 12, 666], 'Besouro', 'viola'],
    ['Grant', 'rock', [703, 688, 696, 698, 689, 697], 'Penhasco', 'grant'],
    ['Korrina', 'fighting', [619, 674, 67, 675, 701, 448], 'Estrondo', 'korrina'],
    ['Ramos', 'grass', [189, 70, 672, 708, 709, 673], 'Planta', 'ramos'],
    ['Clemont', 'electric', [694, 587, 702, 82, 695, 462], 'Voltagem', 'clemont'],
    ['Valerie', 'fairy', [303, 122, 682, 683, 685, 700], 'Fada', 'valerie'],
    ['Olympia', 'psychic', [677, 561, 199, 576, 655, 678], 'Psíquica', 'olympia'],
    ['Wulfric', 'ice', [712, 615, 362, 460, 87, 713], 'Iceberg', 'wulfric'],
  ], [
    ['Malva', 'fire', [667, 324, 609, 654, 663, 668], undefined, 'malva'],
    ['Siebold', 'water', [692, 91, 121, 130, 689, 693], undefined, 'siebold'],
    ['Wikstrom', 'steel', [679, 680, 476, 212, 707, 681], undefined, 'wikstrom'],
    ['Drasna', 'dragon', [714, 334, 621, 691, 706, 715], undefined, 'drasna'],
  ], ['Diantha', 'fairy', [701, 697, 699, 711, 706, 282], undefined, 'diantha'], 'Campeã'),
  makeRegion('alola', 'Alola', 'VII', 48, SHOWDOWN_SPRITES, [
    ['Ilima', 'normal', [734, 735, 235, 775, 20, 676], 'Normalium', 'ilima'],
    ['Lana', 'water', [171, 771, 746, 748, 752, 730], 'Aquium', 'lana'],
    ['Kiawe', 'fire', [757, 758, 105, 776, 663, 59], 'Pyrium', 'kiawe'],
    ['Mallow', 'grass', [761, 762, 763, 754, 756, 764], 'Florium', 'mallow'],
    ['Sophocles', 'electric', [777, 737, 738, 26, 702, 125], 'Electrium', 'sophocles'],
    ['Mina', 'fairy', [743, 468, 707, 210, 184, 700], 'Feérium', 'mina'],
    ['Hapu', 'ground', [750, 423, 450, 330, 623, 770], 'Terrium', 'hapu'],
    ['Nanu', 'dark', [53, 262, 229, 553, 625, 359], 'Obscurium', 'nanu'],
  ], [
    ['Hala', 'fighting', [57, 62, 297, 740, 760, 68], undefined, 'hala'],
    ['Olivia', 'rock', [369, 703, 476, 526, 76, 745], undefined, 'olivia'],
    ['Acerola', 'ghost', [302, 354, 426, 781, 778, 442], undefined, 'acerola'],
    ['Kahili', 'flying', [227, 169, 628, 630, 741, 733], undefined, 'kahili'],
  ], ['Kukui', 'normal', [745, 38, 143, 462, 628, 727], undefined, 'kukui']),
  makeRegion('galar', 'Galar', 'VIII', 56, SHOWDOWN_SPRITES, [
    ['Milo', 'grass', [829, 830, 840, 841, 842, 812], 'Cultivo', 'milo'],
    ['Nessa', 'water', [833, 834, 846, 847, 279, 119], 'Maré', 'nessa'],
    ['Kabu', 'fire', [850, 851, 38, 59, 839, 324], 'Chama', 'kabu'],
    ['Allister', 'ghost', [867, 563, 94, 855, 778, 477], 'Máscara', 'allister'],
    ['Opal', 'fairy', [869, 110, 303, 858, 468, 683], 'Laço', 'opal'],
    ['Melony', 'ice', [875, 873, 555, 866, 131, 460], 'Geada', 'melony'],
    ['Piers', 'dark', [560, 687, 435, 862, 849, 510], 'Punk', 'piers'],
    ['Raihan', 'dragon', [526, 330, 844, 884, 706, 334], 'Escama', 'raihan'],
  ], [
    ['Bea', 'fighting', [237, 675, 865, 853, 68, 701], undefined, 'bea'],
    ['Marnie', 'dark', [877, 510, 560, 454, 861, 845], undefined, 'marnie'],
    ['Bede', 'fairy', [303, 78, 282, 858, 700, 683], undefined, 'bede'],
    ['Gordie', 'rock', [688, 689, 213, 874, 838, 839], undefined, 'gordie'],
  ], ['Leon', 'fire', [681, 887, 612, 537, 866, 6], undefined, 'leon']),
  makeRegion('paldea', 'Paldea', 'IX', 64, SHOWDOWN_SPRITES, [
    ['Katy', 'bug', [919, 920, 917, 918, 216, 217], 'Confeito', 'katy'],
    ['Brassius', 'grass', [928, 929, 930, 548, 185, 549], 'Tela', 'brassius'],
    ['Iono', 'electric', [940, 941, 939, 404, 405, 429], 'Transmissão', 'iono'],
    ['Kofu', 'water', [960, 961, 976, 739, 740, 73], 'Mercado', 'kofu'],
    ['Larry', 'normal', [775, 982, 128, 143, 241, 531], 'Expediente', 'larry'],
    ['Ryme', 'ghost', [971, 972, 778, 849, 354, 94], 'Rima', 'ryme'],
    ['Tulip', 'psychic', [981, 956, 282, 671, 65, 196], 'Cosmético', 'tulip'],
    ['Grusha', 'ice', [974, 975, 614, 873, 615, 362], 'Descida', 'grusha'],
  ], [
    ['Rika', 'ground', [340, 323, 232, 51, 980, 473], undefined, 'rika'],
    ['Poppy', 'steel', [879, 437, 823, 462, 959, 707], undefined, 'poppy'],
    ['Larry', 'flying', [973, 398, 334, 227, 630, 823], undefined, 'larry'],
    ['Hassel', 'dragon', [715, 691, 612, 841, 998, 445], undefined, 'hassel'],
  ], ['Geeta', 'normal', [956, 673, 976, 713, 983, 970], undefined, 'geeta'], 'Campeã'),
];
/** Quantas insígnias existem ao todo (8 por região). */
export const TOTAL_BADGES = LEAGUE_REGIONS.length * 8;
export const ALL_CHALLENGES: readonly Challenge[] = LEAGUE_REGIONS.flatMap((r) => [...r.gyms, ...r.elite, r.champion]);
export const regionOf = (c: Challenge): LeagueRegion => LEAGUE_REGIONS.find((r) => r.id === (c.region ?? 'sinnoh'))!;
export function regionalProgress(p: LeagueProgress, id: RegionId): LeagueProgress {
  const region = LEAGUE_REGIONS.find((r) => r.id === id)!;
  const counters = id === 'sinnoh' ? p : p.regions?.[id];
  return { badges: p.badges.filter((b) => b >= region.badgeOffset && b < region.badgeOffset + 8).map((b) => b - region.badgeOffset),
    eliteStreak: counters?.eliteStreak ?? 0, championWins: counters?.championWins ?? 0, beaten: p.beaten };
}

export function challengeById(id: string): Challenge | null {
  return ALL_CHALLENGES.find((c) => c.id === id) ?? null;
}

export interface LeagueProgress {
  /** Insígnias globais: Sinnoh 0–7, Kanto 8–15, Johto 16–23, Hoenn 24–31, Unova 32–39, Kalos 40–47, Alola 48–55, Galar 56–63, Paldea 64–71. */
  badges: number[];
  /** Corridas e títulos das regiões novas; os campos antigos abaixo continuam sendo Sinnoh. */
  regions?: Partial<Record<RegionId, { eliteStreak: number; championWins: number }>>;
  /** Quantos da Elite 4 já foram vencidos nesta corrida (0 a 4; 4 = Campeã liberada). */
  eliteStreak: number;
  /** Quantas vezes venceu Cynthia em Sinnoh. */
  championWins: number;
  /** Desafios já vencidos alguma vez (para o XP cheio só na primeira). */
  beaten: string[];
}

export function emptyLeague(): LeagueProgress {
  return { badges: [], eliteStreak: 0, championWins: 0, beaten: [] };
}

/** Recompensas que entram nos modos de jogo — não são moedas nem cosméticos. */
export interface LeaguePerks {
  /** Redução por disparo no Pins; as insígnias diminuem um custo que afeta cada decisão de campo. */
  pinShotDiscount: number;
  /** Campos iniciais do Pins liberados pelas vitórias da Liga. */
  pinFields: readonly ('natural' | 'ice' | 'toxic' | 'psy')[];
}

/**
 * As quatro primeiras insígnias já deixam a economia de Pins menos punitiva; cada ciclo de 8 amplia o desconto.
 * Um título de Campeão libera o campo psíquico. Tudo é derivado do progresso salvo, portanto não existe prêmio
 * duplicável nem compra escondida.
 */
export function leaguePerks(progress: LeagueProgress): LeaguePerks {
  const badges = progress.badges.length;
  const champions = progress.championWins + Object.values(progress.regions ?? {}).reduce((sum, region) => sum + (region?.championWins ?? 0), 0);
  const pinShotDiscount = Math.min(6, Math.floor(badges / 4) + champions);
  const fields: ('natural' | 'ice' | 'toxic' | 'psy')[] = ['natural'];
  if (badges >= 4) fields.push('ice');
  if (badges >= 8) fields.push('toxic');
  if (champions > 0) fields.push('psy');
  return { pinShotDiscount, pinFields: fields };
}

export function normalizeLeague(raw: unknown): LeagueProgress {
  const r = (raw ?? {}) as Partial<LeagueProgress>;
  const badges = Array.isArray(r.badges) ? [...new Set(r.badges.filter((b) => Number.isInteger(b) && b >= 0 && b < TOTAL_BADGES))].sort((a, b) => a - b) : [];
  const ids = new Set(ALL_CHALLENGES.map((c) => c.id));
  return {
    badges,
    ...(r.regions && typeof r.regions === 'object' ? { regions: Object.fromEntries(
      LEAGUE_REGIONS.filter((region) => region.id !== 'sinnoh').map(({ id }) => {
        const value = r.regions?.[id];
        return [id, { eliteStreak: Number.isInteger(value?.eliteStreak) ? Math.min(4, Math.max(0, value!.eliteStreak)) : 0,
          championWins: Number.isInteger(value?.championWins) ? Math.max(0, value!.championWins) : 0 }];
      }),
    ) } : {}),
    eliteStreak: Number.isInteger(r.eliteStreak) ? Math.min(ELITE.length, Math.max(0, r.eliteStreak!)) : 0,
    championWins: Number.isInteger(r.championWins) ? Math.max(0, r.championWins!) : 0,
    beaten: Array.isArray(r.beaten) ? r.beaten.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [],
  };
}

export type ChallengeStatus = 'locked' | 'open' | 'beaten';

/**
 * Ginásio: aberto se o anterior já foi vencido (o primeiro sempre). A Elite 4 só abre com as 8 insígnias, um de cada
 * vez, na ordem da corrida; a Campeã depois dos 4. Desafios já vencidos continuam jogáveis (revanche).
 */
export function statusOf(progress: LeagueProgress, challenge: Challenge): ChallengeStatus {
  return localStatusOf(regionalProgress(progress, regionOf(challenge).id), challenge);
}
function localStatusOf(progress: LeagueProgress, challenge: Challenge): ChallengeStatus {
  if (challenge.kind === 'gym') {
    if (progress.badges.includes(challenge.order)) return 'beaten';
    return challenge.order === 0 || progress.badges.includes(challenge.order - 1) ? 'open' : 'locked';
  }
  const allBadges = progress.badges.length === GYMS.length;
  if (!allBadges) return 'locked';
  if (challenge.kind === 'elite') {
    if (challenge.order === progress.eliteStreak) return 'open';
    return challenge.order < progress.eliteStreak ? 'beaten' : 'locked';
  }
  return progress.eliteStreak >= ELITE.length ? 'open' : progress.championWins > 0 ? 'beaten' : 'locked';
}

export interface LeagueOutcome {
  progress: LeagueProgress;
  /** Primeira vitória contra esse desafio. */
  first: boolean;
  /** O que dizer ao jogador. */
  message: string;
}

/** Aplica o resultado de uma batalha da Liga. */
export function applyLeagueResult(prev: LeagueProgress, challenge: Challenge, won: boolean): LeagueOutcome {
  const region = regionOf(challenge);
  if (statusOf(prev, challenge) === 'locked') return { progress: prev, first: false, message: 'Este desafio ainda está bloqueado.' };
  const result = applyLocalResult(regionalProgress(prev, region.id), challenge, won);
  const local = result.progress;
  const progress: LeagueProgress = { ...prev, badges: [...prev.badges.filter((b) => b < region.badgeOffset || b >= region.badgeOffset + 8), ...local.badges.map((b) => b + region.badgeOffset)].sort((a, b) => a - b), beaten: local.beaten };
  if (region.id === 'sinnoh') { progress.eliteStreak = local.eliteStreak; progress.championWins = local.championWins; }
  else progress.regions = { ...prev.regions, [region.id]: { eliteStreak: local.eliteStreak, championWins: local.championWins } };
  return { ...result, progress };
}
function applyLocalResult(prev: LeagueProgress, challenge: Challenge, won: boolean): LeagueOutcome {
  const p: LeagueProgress = { ...prev, badges: [...prev.badges], beaten: [...prev.beaten] };
  if (!won) {
    if (challenge.kind !== 'gym' && p.eliteStreak > 0) {
      p.eliteStreak = 0;
      return { progress: p, first: false, message: 'A corrida da Elite 4 voltou ao começo. Treine e tente de novo!' };
    }
    return { progress: p, first: false, message: `${challenge.leader} venceu desta vez. Treine e tente de novo!` };
  }
  const first = !p.beaten.includes(challenge.id);
  if (first) p.beaten.push(challenge.id);
  if (challenge.kind === 'gym') {
    if (!p.badges.includes(challenge.order)) p.badges = [...p.badges, challenge.order].sort((a, b) => a - b);
    return { progress: p, first, message: first ? `Você ganhou a ${challenge.badge?.name ?? 'insígnia'}!` : `Revanche vencida contra ${challenge.leader}!` };
  }
  if (challenge.kind === 'elite') {
    p.eliteStreak = Math.max(p.eliteStreak, challenge.order + 1);
    return { progress: p, first, message: p.eliteStreak >= ELITE.length ? `Os 4 da Elite foram vencidos! ${regionOf(challenge).champion.leader} espera.` : `${challenge.leader} foi vencido(a). Próximo da Elite 4!` };
  }
  p.championWins++;
  p.eliteStreak = 0;
  return { progress: p, first, message: 'Você é o Campeão da Liga! Hall da Fama!' };
}

/** O próximo desafio aberto (o que o jogador "deveria" fazer agora), ou null se a Liga foi vencida e nada está aberto. */
export function nextChallenge(progress: LeagueProgress, region: RegionId = 'sinnoh'): Challenge | null {
  return ALL_CHALLENGES.filter((c) => regionOf(c).id === region).find((c) => statusOf(progress, c) === 'open') ?? null;
}

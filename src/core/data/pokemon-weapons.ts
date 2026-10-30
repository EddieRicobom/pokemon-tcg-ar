import megaData from './pokemon-megas.json';
import { REGION_FORM_IDS } from '../dex-form';
import type { WeaponId } from '../dungeon-weapons';

/**
 * Arsenal canônico da Pokédex Nacional. A posição 1 é Bulbasaur e a 1025 é
 * Pecharunt. É uma tabela estática — nunca uma fórmula de atributos: a arma
 * descreve o jeito de lutar da espécie. Os símbolos deixam os 1025 vínculos
 * auditáveis sem transformar este arquivo em uma lista de milhares de linhas.
 *
 * Assinaturas que orientam a curadoria: Beedrill → enxameador, Scyther/Scizor
 * → lâminas, Machamp → manoplas, Mr. Mime → projetor de barreira, Tangela →
 * lança-correntes, Bronzong → guardião orbital, Blastoise → canhão de carga,
 * Electivire → condutor de arco, Gallade → espada longa, Aegislash → espada e
 * escudo, Ariados → lançador de armadilhas e Golurk → martelo.
 */
export const NATIONAL_DEX_LAST = 1025;

type WeaponCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'X';

const CODE_WEAPON: Readonly<Record<WeaponCode, WeaponId>> = {
  A: 'laminas', B: 'espada', C: 'martelo', D: 'lanca', E: 'manoplas', F: 'escudo', G: 'barreira', H: 'orbital', I: 'espadaEscudo', J: 'emissor',
  L: 'dispersao', M: 'continuo', N: 'canhao', O: 'lancador', P: 'condutor', Q: 'rifle', R: 'disco', S: 'armadilhas', T: 'correntes', X: 'enxameador',
};

// 1–1025, em blocos de 100 para revisão. A tabela já inclui as exceções de espécie (não há fallback por stats).
const SPECIES_CODES = [
  'TTTMMMNNNXXXXXXBBBBBBBSSPPCCSSSSSSJJMMBBSSTTTXXXXCCBBNNEEMMNNNGGGEEETTTNNQQQMMNNPPBBBNNSSNNHHHCGGNNP',
  'PTTCCEEBSSCCBTBNNNNNNGALPMABNNNBBNPMBQQQQQBLPMDDDGGTTTMMMNNNBBBBXXXXSNNPJBJJGGPPPTNNQNTTTBTTXNNGAANH',
  'GGBXXBCFJJNAXXABBMMLLNNNLNFAANCCBBBEELPMBBPMNQQQGMGTTTMMMNNNAABBXXXXXNNNTTTBBNNGGGXXTTBBBXXXBBBEEBQB',
  'BAFFFFEEPPPPXXTSSNNNNMMMGGLCCDTTBDBSQQNNNNCCQQQQNNBBHHHHTGAGLLLLLNNNNNDDDFFHQLFDDNCDFGTTTMMMNNQQQQBB',
  'XXPPPTTQQQQXXXXXPNNTTNNBHHBBHABBGSSFFQGBBHDDDBEECCSSSSTNNNTTAHBCTPMJXTLCLBBQHLPGGGFNMBHGNNATBGTTTMMM',
  'NNNBBBBBAATTMMNNGGBBBPPQQQGGCCBEEENNNEEXXXXXXTTTTNCCCMMTXXAAGHHNNQQSSAABBGGGGGGNNLLLBBPXBTTNNNXXTTFF',
  'FPPPGGHHMDDDLLLXXCEEDCCAABBBAAMAAAAXXFQTRPDDPDNBXTTTMMMNNRBBBMMXXXMMJJJTTEEBGGIIIJJJJAAQQSSOOPPQCQQJ',
  'EPQDDTFHHHHLLRRJAHQGMTTBMMENNMBBBBBXXXEERXXQQNSSCCNNTTTTSSBBTTTJBEXAHHNBBQBMPHRMTDDDPGTMGGGGQXEPFACG',
  'HESXQMPFFTTTMMENNMBBRRFXXGAATCBBNMPPQQQTTTCCRNNPPMMEEHHGGGAAAAFHELCJJFPLLQLGPFFPPNNADDDAISEEAPPLAHBX',
  'CNESJTTTMMMNNRBBXXXXPPPBXJTTTTBQQQMXBPPPPAASSTTCCCTTXXGGJJCMQRNNFFDFQQHHRLLNNDESBBICJTCGTHMPRMFDDDHH',
  'AAAADCGMTPTTTSSSGMTGPCPQS',
] as const;

const CODES = SPECIES_CODES.join('');
const regionalBase = new Map<number, number>(
  Object.entries(REGION_FORM_IDS).flatMap(([base, regions]) => Object.values(regions).map((form) => [form, Number(base)] as const)),
);
interface MegaRow { dex: number; id: number }
const megaBase = new Map<number, number>((megaData.forms as MegaRow[]).map((form) => [form.id, form.dex]));

/** Espécie nacional da forma regional ou Mega; `null` quando o id é desconhecido. */
export function baseSpeciesDexId(dexId: number): number | null {
  if (Number.isInteger(dexId) && dexId >= 1 && dexId <= NATIONAL_DEX_LAST) return dexId;
  return regionalBase.get(dexId) ?? megaBase.get(dexId) ?? null;
}

/** Arma inata da espécie. Formas regionais e Mega compartilham a da espécie-base. */
export function weaponOfDex(dexId: number): WeaponId | null {
  const base = baseSpeciesDexId(dexId);
  const code = base === null ? undefined : CODES[base - 1] as WeaponCode | undefined;
  return code ? CODE_WEAPON[code] : null;
}

/** Invariante útil para o teste e para futuras alterações no catálogo. */
export function hasCompleteWeaponTable(): boolean {
  return CODES.length === NATIONAL_DEX_LAST && [...CODES].every((code) => code in CODE_WEAPON);
}

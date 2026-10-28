import type { Template } from './kit';
import { CIDADE_MOMENTS } from './cidade';
import { DUO2A_MOMENTS } from './duo2a';
import { DUO2B_MOMENTS } from './duo2b';
import { ROMANCE2_MOMENTS } from './romance2';
import { SOLO2_MOMENTS } from './solo2';
import { TRIO2_MOMENTS } from './trio2';
import { BOSQUE_MOMENTS } from './bosque';
import { FAZENDA_MOMENTS } from './fazenda';
import { LAGO_MOMENTS } from './lago';
import { PARQUE_MOMENTS } from './parque';
import { PASSEIOS_MOMENTS } from './passeios';
import { RUAS_MOMENTS } from './ruas';
import { TENSION_MOMENTS } from './tension';
import { NOTICE_MOMENTS } from './notice';
import { MIRAGEM_MOMENTS } from './miragem';

/** A segunda leva de momentos (a Vila dobrou de tamanho): solo, duplas, trios, romance e a vida na cidade. */
export const EXTRA_MOMENTS: readonly Template[] = [
  ...SOLO2_MOMENTS, ...DUO2A_MOMENTS, ...DUO2B_MOMENTS, ...TRIO2_MOMENTS, ...ROMANCE2_MOMENTS, ...CIDADE_MOMENTS,
  // A terceira leva (o mapa grande): o lago com praia, a fazenda, o parquinho, o bosque com a pedreira e as ruas novas.
  ...LAGO_MOMENTS, ...FAZENDA_MOMENTS, ...PARQUE_MOMENTS, ...BOSQUE_MOMENTS, ...RUAS_MOMENTS, ...PASSEIOS_MOMENTS, ...TENSION_MOMENTS, ...NOTICE_MOMENTS,
  // O Monte Miragem a oeste, com a Estátua do Mew no topo (só contemplação, sem efeito de jogo).
  ...MIRAGEM_MOMENTS,
];

import type { Template } from './kit';
import { CIDADE_MOMENTS } from './cidade';
import { DUO2A_MOMENTS } from './duo2a';
import { DUO2B_MOMENTS } from './duo2b';
import { ROMANCE2_MOMENTS } from './romance2';
import { SOLO2_MOMENTS } from './solo2';
import { TRIO2_MOMENTS } from './trio2';

/** A segunda leva de momentos (a Vila dobrou de tamanho): solo, duplas, trios, romance e a vida na cidade. */
export const EXTRA_MOMENTS: readonly Template[] = [...SOLO2_MOMENTS, ...DUO2A_MOMENTS, ...DUO2B_MOMENTS, ...TRIO2_MOMENTS, ...ROMANCE2_MOMENTS, ...CIDADE_MOMENTS];

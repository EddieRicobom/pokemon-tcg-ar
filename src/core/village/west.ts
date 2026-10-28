/**
 * Colunas que o Monte Miragem acrescenta à esquerda do mapa (desde o `MAP_LAYOUT` 3). O gerador continua desenhando a
 * cidade no quadro antigo (mesmo sorteio, mesmas matas) e `generateVillage` desloca o mapa pronto `WEST` blocos para a
 * direita; as coordenadas fixas usadas em jogo (`TOWN`, `LOTS`, lugares, bancos…) já vêm somadas. Saves do desenho
 * anterior são deslocados por `migrateLayout`. Arquivo sem importações, para qualquer módulo do mapa usar sem ciclos.
 */
export const WEST = 28;

/** Desloca um ponto (ou retângulo) do quadro antigo para o mapa com o monte. */
export function west<T extends { x: number }>(p: T): T {
  return { ...p, x: p.x + WEST };
}

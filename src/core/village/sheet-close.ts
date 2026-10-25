/** A saída da Torre precisa ser confirmada pelo jogo; seções do menu voltam primeiro. */
export function villageSheetCloseAction(sheet: string | null, menuAtHome: boolean): 'none' | 'back' | 'tower' | 'close' {
  if (!sheet) return 'none';
  if (sheet === 'menu' && !menuAtHome) return 'back';
  if (sheet === 'torre') return 'tower';
  return 'close';
}

import { describe, expect, it } from 'vitest';
import { villageSheetCloseAction } from './sheet-close';

describe('fechamento das folhas da Vila', () => {
  it('respeita navegação interna e confirmação da Torre', () => {
    expect(villageSheetCloseAction(null, true)).toBe('none');
    expect(villageSheetCloseAction('menu', false)).toBe('back');
    expect(villageSheetCloseAction('menu', true)).toBe('close');
    expect(villageSheetCloseAction('torre', true)).toBe('tower');
    expect(villageSheetCloseAction('shop', true)).toBe('close');
  });
});

import { describe, expect, it } from 'vitest';
import { applyBackup, buildBackup, parseBackupZip, serializeBackupZip } from './backup';
import { loadVillage, VILLAGE_KEY } from './village-store';
import { emptyVillage } from '../core/village/life';
import { homeValue } from '../core/village/home-state';
import { payResidentWork } from '../core/village/resident-economy';

describe('backup da Vila ampliada', () => {
  it('transfere móveis, novas reformas, estilos, profissões e carteiras para um armazenamento vazio', () => {
    localStorage.clear();
    const state = emptyVillage(20261014, { x: 45, y: 41 });
    state.house = 6; state.homes['0'] = homeValue(5, 15, 6);
    state.homeStyles['0'] = 'praiano'; state.homeStyles['-1'] = 'noturno';
    state.homeInterior.placed = [{ x: 1, y: 1, item: 'comoda' }];
    state.homeInteriors['0'] = { wallpaper: 'floral', floor: 'carvalho', placed: [{ x: 0, y: 0, item: 'cama-colcha' }] };
    state.placed.push({ x: 42, y: 79, item: 'jardineira-lavanda' });
    state.mailCarrierId = 'carteiro'; state.cafeWaiterId = 'atendente';
    state.homeProjects['0'] = { day: '2026-10-22', lastChangeDay: '2026-10-21', savings: 40, completedActivities: 5 };
    payResidentWork(state, 'atendente', 'cafe', 'pedido-1', '2026-10-22', 4);
    localStorage.setItem(VILLAGE_KEY, JSON.stringify(state));
    const bytes = serializeBackupZip(buildBackup(localStorage));
    localStorage.clear();
    const parsed = parseBackupZip(bytes);
    expect(typeof parsed).toBe('object');
    if (typeof parsed !== 'object') throw new Error('Backup inválido');
    applyBackup(parsed, localStorage);
    const restored = loadVillage();
    for (const key of ['house', 'homes', 'homeStyles', 'homeInterior', 'homeInteriors', 'homeProjects', 'residentEconomy', 'mailCarrierId', 'cafeWaiterId', 'placed'] as const) expect(restored[key], key).toEqual(state[key]);
    expect(payResidentWork(restored, 'atendente', 'cafe', 'pedido-1', '2026-10-22', 4)).toBe(0);
    localStorage.clear();
  });
});

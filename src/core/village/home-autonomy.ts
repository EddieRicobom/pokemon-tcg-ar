import type { VillageState } from './life';
import { itemDef } from './catalog';
import { findHomeFurnitureSlot } from './home-layout';
import { homeDecor, homeLevel, homeRoof, homeValue } from './home-state';
import { HOME_STAGES, homeOf, homeStyleOf, RESIDENT_HOME_PREFS } from './town';
import type { ResidentHomeChange } from './town';
import { hash, personalityOf } from './personality';
import type { HomeExteriorStyle } from './town-layout';
import { householdFunds, spendHousehold } from './resident-economy';

export const HOME_RENOVATION_PRICES = [0, 100, 220, 380, 620, 950] as const;
const ALTERNATIVES: Readonly<Record<string, readonly HomeExteriorStyle[]>> = {
  Brincalhão: ['festivo', 'praiano'], Calmo: ['jardim', 'rústico'], Tímido: ['rústico', 'tradicional'],
  Corajoso: ['serrano', 'moderno'], Guloso: ['tradicional', 'jardim'], Sonhador: ['noturno', 'praiano'],
  Curioso: ['praiano', 'moderno'], Mandão: ['moderno', 'serrano'],
};

/** Uma iniciativa por casa/dia, custeada exclusivamente pela renda real dos moradores. */
export function advanceResidentHomes(s: VillageState, homes: ReadonlyMap<string, number>, today: string): { changed: boolean; events: ResidentHomeChange[] } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(today))) return { changed: false, events: [] };
  const groups = new Map<number, string[]>();
  for (const [id, lot] of homes) groups.set(lot, [...(groups.get(lot) ?? []), id]);
  const events: ResidentHomeChange[] = [];
  let changed = false;
  for (const [lot, ids] of groups) {
    const residentId = [...ids].sort()[0];
    const interior = s.homeInteriors[String(lot)];
    if (!residentId || !interior) continue;
    const completed = ids.reduce((sum, id) => sum + (s.community.residents[id]?.completedActivities ?? 0), 0);
    const project = s.homeProjects[String(lot)];
    if (!project) {
      s.homeProjects[String(lot)] = { day: today, lastChangeDay: today, savings: 0, completedActivities: completed };
      changed = true;
      continue;
    }
    const elapsed = Math.floor((Date.parse(today) - Date.parse(project.day || today)) / 86400000);
    if (elapsed <= 0) continue;
    project.savings = householdFunds(s, ids);
    project.day = today;
    project.completedActivities = completed;
    changed = true;
    if (project.lastChangeDay >= today || s.community.welfare < 35) continue;
    const personality = personalityOf(residentId).name;
    const pref = RESIDENT_HOME_PREFS[personality] ?? RESIDENT_HOME_PREFS.Calmo!;
    const desire = hash(`${s.seed}:${lot}:${today}:casa`);
    if (desire % 100 >= 65) continue;
    const value = homeOf(s, lot);
    const level = homeLevel(value);
    const event: ResidentHomeChange = { lot, residentId, style: homeStyleOf(s, lot), items: [] };
    const renovationCost = HOME_RENOVATION_PRICES[level + 1];
    if (renovationCost && project.savings >= renovationCost) {
      spendHousehold(s, ids, renovationCost);
      s.homes[String(lot)] = homeValue(level + 1, homeDecor(value), homeRoof(value));
      event.renovation = HOME_STAGES[level + 1]!.name;
    } else {
      const daysSinceChange = Math.floor((Date.parse(today) - Date.parse(project.lastChangeDay || today)) / 86400000);
      const options = ALTERNATIVES[personality] ?? ['rústico'];
      const style = options[(desire >>> 8) % options.length]!;
      if (daysSinceChange >= 7 && style !== event.style && project.savings >= 65 && desire % 3 === 0) {
        spendHousehold(s, ids, 65);
        s.homeStyles[String(lot)] = style;
        event.style = style;
        event.restyled = true;
      } else if (interior.placed.length < Math.min(12, level + 5)) {
        const choice = pref.items.find((id) => !interior.placed.some((p) => p.item === id));
        const def = choice ? itemDef(choice) : undefined;
        const cost = def ? Math.max(40, def.price || def.sell * 3) : Infinity;
        const position = choice ? findHomeFurnitureSlot(interior, choice) : null;
        // Guardar para uma reforma também é uma decisão: não gasta tudo em móveis a cada dia.
        if (choice && def && position && project.savings >= cost && (level >= 5 || desire % 3 === 1)) {
          spendHousehold(s, ids, cost);
          interior.placed.push({ ...position, item: choice });
          event.items.push(def.name);
        }
      }
    }
    if (event.items.length || event.renovation || event.restyled) {
      project.savings = householdFunds(s, ids);
      project.lastChangeDay = today;
      events.push(event);
    }
  }
  return { changed, events };
}

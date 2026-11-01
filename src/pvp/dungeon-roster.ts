import { ammoOptions, createMember, recomputeMember, weaponOfDex } from '../core/dungeon';
import type { Member } from '../core/dungeon';
import type { DuelRoster } from '../core/dungeon-duel';
import { typesOfDex } from '../core/species-filter';
import { speciesName } from '../core/survivor-evolution';
import { statsOfDex } from '../core/survivor-stats';
import type { WireDuelMember, WireDuelRoster } from './dungeon-wire';

/**
 * A equipe do duelo indo e voltando pelo fio. Só viaja o que não se deduz da espécie (vida, carga, munição, gemas); quem
 * recebe recalcula stats, tipos e arma pelo número da Pokédex com os dados do próprio app. Assim ninguém «inventa» um
 * Pokémon mais forte do que a espécie permite, e dado que o app não tem (espécie desconhecida) é recusado, não chutado.
 * Os dois celulares montam as DUAS equipes por este mesmo caminho (inclusive a própria), para o estado inicial ser idêntico.
 */

export function memberToWire(m: Member): WireDuelMember {
  return { id: m.id.slice(0, 80), dexId: m.dexId, name: m.name.slice(0, 40), hp: Math.max(0, Math.round(m.hp)), charge: Math.max(0, Math.round(m.charge)), ammo: [...m.ammo], gems: m.gems.map((g) => (g ? { ...g } : null)) };
}

export function rosterToWire(members: readonly Member[], fusionCharges: number, potions: number): WireDuelRoster {
  return { members: members.map(memberToWire), fusionCharges: Math.max(0, Math.min(50, fusionCharges)), potions: Math.max(0, Math.min(50, potions)) };
}

/** Reconstrói um membro a partir do fio; null se o app não tem dados dessa espécie ou a munição não combina com ela. */
export function memberFromWire(w: WireDuelMember): Member | null {
  const stats = statsOfDex(w.dexId);
  const types = typesOfDex(w.dexId);
  if (!stats || types.length === 0 || !weaponOfDex(w.dexId)) return null;
  const member = createMember({ id: w.id, dexId: w.dexId, name: w.name.trim() || speciesName(w.dexId) || `#${w.dexId}`, types: [...types], stats });
  const ammo = ammoOptions(member).find((option) => option.length === w.ammo.length && option.every((t, i) => t === w.ammo[i]));
  if (!ammo) return null;
  member.ammo = [...ammo];
  member.gems = w.gems.map((g) => (g ? { ...g } : null));
  recomputeMember(member);
  member.hp = Math.min(w.hp, member.maxHp);
  member.charge = Math.min(w.charge, member.maxCharge);
  member.status = member.hp > 0 ? 'ready' : 'down';
  return member;
}

export function rosterFromWire(w: WireDuelRoster): DuelRoster | null {
  const members: Member[] = [];
  for (const wire of w.members) {
    const member = memberFromWire(wire);
    if (!member) return null;
    members.push(member);
  }
  return members.some((m) => m.hp > 0) ? { members, fusionCharges: w.fusionCharges, potions: w.potions } : null;
}

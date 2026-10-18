import { generateVillage } from '../src/core/village/map';
const m = generateVillage(20261014);
const ch: Record<string, string> = { grass: '.', tall: '"', flower: '*', path: '=', sand: ':', water: '~', tree: 'T', rock: 'o', bush: 'b', plot: 'P', shop: 'S', building: '#', lamp: 'i', trail: '-', plaza: '+', field: 'f', deco: 'd' };
for (let y = 0; y < m.h; y++) { let row = ''; for (let x = 0; x < m.w; x++) row += x === m.spawn.x && y === m.spawn.y ? '@' : ch[m.tiles[y * m.w + x]!]; console.log(String(y).padStart(2) + ' ' + row); }

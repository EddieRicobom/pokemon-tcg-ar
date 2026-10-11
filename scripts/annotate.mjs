/** Imprime um JSON como anotações `::notice::` do GitHub Actions (legíveis sem baixar logs). */
import { readFileSync } from 'node:fs';

const [file, title] = process.argv.slice(2);
const text = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
const size = 3200;
const parts = Math.ceil(text.length / size);
for (let i = 0; i < parts; i++) {
  const chunk = text.slice(i * size, (i + 1) * size).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::notice title=${title} (${i + 1}/${parts})::${chunk}`);
}

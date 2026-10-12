/** Junta os resultados por carta e as mensagens de erro do Playwright num JSON só (vira anotação no CI). */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const [dir, out] = process.argv.slice(2);
const resultsDir = `${dir}/results`;
const results = existsSync(resultsDir)
  ? readdirSync(resultsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${resultsDir}/${f}`, 'utf8')))
  : [];
const errors = [];
const reportPath = `${dir}/pw-report.json`;
if (existsSync(reportPath)) {
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const r of t.results ?? []) {
          if (r.status !== 'passed') errors.push({ title: spec.title, status: r.status, message: String(r.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 700) });
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of JSON.parse(readFileSync(reportPath, 'utf8')).suites ?? []) walk(suite);
}
writeFileSync(out, JSON.stringify({ note: 'Chromium com câmera falsa no runner do GitHub; teste automatizado, NÃO é um celular.', results, errors }, null, 2));

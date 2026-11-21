// view one mock: node view.mjs <name> [fromCol] [toCol]
import { readdirSync } from 'node:fs';
import { mocks, textOf } from './lib.mjs';
for (const f of readdirSync(import.meta.dirname).filter((n) => n.startsWith('mocks-')).sort()) await import('./' + f);
const [name, a = '0', b = '999'] = process.argv.slice(2);
for (const l of mocks.get(name).lines) console.log([...textOf(l)].slice(+a, +b).join(''));

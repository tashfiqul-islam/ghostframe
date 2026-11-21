// view one mock: node view.mjs <name> [fromCol] [toCol]
import { readdirSync } from 'node:fs'
import { mocks, textOf } from './lib'
for (const f of readdirSync(import.meta.dirname)
  .filter(n => n.startsWith('mocks-'))
  .toSorted())
  // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: the mocks register in file order, as in build.ts
  await import('./' + f)
const [name, a = '0', b = '999'] = process.argv.slice(2)
const k = name === undefined ? undefined : mocks.get(name)
if (!k) throw new Error('unknown mock ' + String(name))
for (const l of k.lines) console.log(Array.from(textOf(l)).slice(+a, +b).join(''))

import { expect, test } from 'claude-code/testing'

import { changeHeld, heldValue, loadHeld, nextTick, setHeld, type Held } from '../../hooks/shared/held'

// A value ghostframe alone writes, held as last written so a change never reads it back (docs/development/performance.md).
test('two changes waiting on the same first read share it, and each sees the other', async () => {
  const held: Held<number[]> = {}
  let reads = 0
  const read = async (): Promise<number[]> => {
    reads++
    await Promise.resolve()

    return [1]
  }
  const change = async (n: number): Promise<number[]> => {
    if (held.value === undefined) await loadHeld(held, read())

    return changeHeld(held, list => [...list, n])
  }

  await Promise.all([change(2), change(3)])
  expect(heldValue(held)).toEqual([1, 2, 3])
  // The second change made a read of its own, which was never used: the first read's value stands.
  expect(reads).toBe(2)
})

test('a failed first read is tried again by the next change, never held as a value', async () => {
  const held: Held<number[]> = {}

  await expect(loadHeld(held, Promise.reject(new Error('no state')))).rejects.toThrow('no state')
  expect(held.value).toBeUndefined()
  await loadHeld(held, Promise.resolve([7]))
  expect(heldValue(held)).toEqual([7])
})

test('a held value is frozen, so a change in place throws instead of leaking into every reader', async () => {
  const held: Held<number[]> = {}

  await loadHeld(held, Promise.resolve([1]))
  const changed = changeHeld(held, list => [...list, 2])

  expect(() => changed.push(3)).toThrow()
  const set = setHeld(held, [4])

  expect(() => set.push(5)).toThrow()
  expect(heldValue(held)).toEqual([4])
})

test('a tick always moves forward, from the clock, so a reloaded module never writes one already seen', () => {
  const ahead = Date.now() + 60_000
  const held: Held<number[]> = { tick: ahead }

  // Past the clock: one more each time.
  expect(nextTick(held)).toBe(ahead + 1)
  expect(nextTick(held)).toBe(ahead + 2)
  // A fresh copy of the module starts from the clock, past any tick an earlier copy wrote before now.
  const before = Date.now()

  expect(nextTick({})).toBeGreaterThanOrEqual(before)
})

test('reading or changing a value never loaded is a mistake, said at once', () => {
  expect(() => heldValue({})).toThrow('heldValue before loadHeld')
  expect(() => changeHeld({}, x => x)).toThrow('changeHeld before loadHeld')
})

// Wide enough to stay green on a slow CI runner, far under the seconds the old patterns took.
export const LINEAR_MS = 250

/** Milliseconds `f` takes. */
export const ms = (f: () => unknown) => {
  const t = Date.now()
  f()
  return Date.now() - t
}

export const RUN = ' '.repeat(40000)

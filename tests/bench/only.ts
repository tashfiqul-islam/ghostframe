// Which of the harness benchmark's configs run (tests/bench/session.bench.tsx): all of them when empty. tools/bench/run.ts
// writes its own copy into the temporary root for `--on-only`: the Performance check measures Cockpit on alone, since
// only that is held to a budget, and the off configs would double its time.
export const ONLY: readonly string[] = []

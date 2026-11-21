export const PLAN =
  '# Fix the toast double-fire\n\n1. Extract the toast queue into its own module\n2. Add a **dedupe key** per message\n3. Cover the double-fire case in `toast.e2e.ts`'

export const TODOS = {
  oldTodos: [],
  newTodos: [
    { content: 'extract queue module', status: 'completed', activeForm: 'Extracting' },
    { content: 'add dedupe key', status: 'in_progress', activeForm: 'Adding' },
    { content: 'cover double-fire case', status: 'pending', activeForm: 'Covering' },
    { content: 'run full e2e suite ' + 'and then some more words '.repeat(8), status: 'pending', activeForm: 'Running' }
  ]
}

// The copy button's three states: idle (COPY), copied (COPIED ✓, for 1.2 s), blocked (the clipboard refused, so the
// command is selected for the visitor to copy). One listener serves every command block on the page.

const LABEL = { idle: 'COPY', copied: 'COPIED ✓', blocked: 'SELECTED' } as const
const SAY = {
  copied: 'Copied to the clipboard.',
  blocked: 'The clipboard is blocked. The command is selected; copy it with your keyboard.'
} as const
const BACK_TO_IDLE_MS = 1200

export function wireCopyButtons(root: Document): void {
  root.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy]') : null
    if (button) void copy(button)
  })
}

async function copy(button: HTMLButtonElement): Promise<void> {
  const block = button.closest<HTMLElement>('[data-command-block]')
  const command = block?.querySelector<HTMLElement>('[data-command]')
  const status = block?.querySelector<HTMLElement>('[data-copy-status]')
  if (!block || !command || !status) throw new Error('a copy button sits outside a command block')
  let state: 'copied' | 'blocked'
  try {
    await navigator.clipboard.writeText(command.textContent ?? '')
    state = 'copied'
  } catch {
    getSelection()?.selectAllChildren(command)
    state = 'blocked'
  }
  block.dataset['state'] = state
  button.textContent = LABEL[state]
  status.textContent = SAY[state]
  if (state === 'copied') {
    setTimeout(() => {
      block.dataset['state'] = 'idle'
      button.textContent = LABEL.idle
      status.textContent = ''
    }, BACK_TO_IDLE_MS)
  }
}

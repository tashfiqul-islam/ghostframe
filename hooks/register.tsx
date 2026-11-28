// ghostframe's one hooks module: composes Cockpit, the transcript and the status line's install command. Each event
// is hooked once per feature, in the feature that owns it; the transcript's observe hooks (its ledger) call Cockpit's
// log where Cockpit needs the main loop. The status line feature observes `session.start` only to register its command.
// The transcript restyle is terminal only: any surprise falls through to next(e).
import type { Register } from 'claude-code'

import { registerCockpit } from './cockpit/feature'
import { registerStatusline } from './statusline/command'
import { registerLedger } from './transcript/ledger/feature'
import { registerAgentRows } from './transcript/sites/agents'
import { registerChrome } from './transcript/sites/chrome'
import { registerPrompt } from './transcript/sites/prompt'
import { registerReply } from './transcript/sites/reply/reply'
import { registerToolGroup } from './transcript/sites/tools/group'
import { registerToolResult } from './transcript/sites/tools/result'
import { registerToolUse } from './transcript/sites/tools/use'

export const register: Register = (on, options) => {
  registerCockpit(on, options)
  registerLedger(on)
  registerPrompt(on)
  registerReply(on)
  registerToolUse(on)
  registerToolGroup(on)
  registerToolResult(on)
  registerChrome(on)
  registerAgentRows(on)
  registerStatusline(on)
}
// ci probe: plugin code

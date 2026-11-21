// ghostframe's one hooks module: composes Cockpit and the transcript. Each event is hooked once, in the feature
// that owns it; the transcript's observe hooks (its ledger) call Cockpit's log where Cockpit needs the main loop.
// The transcript restyle is terminal only: any surprise falls through to next(e).
import type { Register } from 'claude-code'

import { registerCockpit } from './cockpit/feature'
import { registerLedger } from './transcript/ledger/feature'
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
}

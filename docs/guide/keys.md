# Keys

Cockpit's keys work only while the pane has the keyboard, so they never take a key from the prompt.

## Moving the keyboard

| Key                 | Does                                                        |
| ------------------- | ----------------------------------------------------------- |
| `ctrl+x` then `tab` | Gives the pane the keyboard (Claude Code's pane chord).     |
| `esc`               | Gives the keyboard back to the prompt.                      |
| `ctrl+x` then `x`   | Closes the pane (Claude Code's chord). `/cockpit` opens it. |
| `tab` / `shift+tab` | Moves between the pane's rows.                              |
| `enter`             | Opens the row under the ring.                               |
| arrows              | Scroll.                                                     |

## In the pane

| Key       | Where                           | Does                                                  |
| --------- | ------------------------------- | ----------------------------------------------------- |
| `1`–`5`   | any tab                         | Switches tab: Timeline, Files, Sources, Todo, Agents. |
| `enter`   | a row                           | Opens its drawer, diff, URL copy, agent, or output.   |
| `c`       | a pane row                      | Copies it.                                            |
| `s`       | Timeline                        | Shows every step, or fits the timeline again.         |
| `p` / `n` | Timeline, every step, inspector | The previous or next turn.                            |
| `l`       | a pinned turn                   | Back to the live turn.                                |
| `b`       | a full diff                     | Back.                                                 |
| `u`       | Sources                         | Hides or shows the URLs.                              |
| `m`       | an agent in view                | Back to the main conversation.                        |

The pane's last row lists the keys of the view you are in.

## Claude Code's own

`ctrl+o` opens the full record of the turn. The engine owns it; Cockpit draws each step in it.

If your terminal or editor takes `ctrl+x` for itself, [Compatibility](compatibility.md#terminals) says what to check.

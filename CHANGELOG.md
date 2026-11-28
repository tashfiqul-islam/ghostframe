# Changelog

## 1.0.0 (2026-11-28)


### Features

* **cockpit:** Cockpit, the redesigned chat UI ([6a07220](https://github.com/tashfiqul-islam/ghostframe/commit/6a07220c84bb631af05cdc16d6dc0fa70c782f84))
* **cockpit:** let tables, code cards and diff cards use a wide left's room ([#50](https://github.com/tashfiqul-islam/ghostframe/issues/50)) ([efc94ae](https://github.com/tashfiqul-islam/ghostframe/commit/efc94aebe7b0284c50c647b41481255ff6adbe78))
* **statusline:** the ghostframe status line ([6def5fb](https://github.com/tashfiqul-islam/ghostframe/commit/6def5fb0daadf29254519472f44c3505a82a1bf6))


### Fixes

* **cockpit:** answer each tool call first, and keep no copy of a large or binary file ([#49](https://github.com/tashfiqul-islam/ghostframe/issues/49)) ([5efef9e](https://github.com/tashfiqul-islam/ghostframe/commit/5efef9e1da19fbfe854b90dd8221e55505fdaa39))
* **cockpit:** count a failed step fixed when a shell step changed its file, or a wrapper hid its key ([#62](https://github.com/tashfiqul-islam/ghostframe/issues/62)) ([687c806](https://github.com/tashfiqul-islam/ghostframe/commit/687c8068d59aab0c5da65294aa19a81b4a6b1e6a))
* **cockpit:** draw a live turn's diamond in accent, and leave the queued hint to Claude Code ([#57](https://github.com/tashfiqul-islam/ghostframe/issues/57)) ([69167dd](https://github.com/tashfiqul-islam/ghostframe/commit/69167ddf3f0d02bba5da9be9f8d6120fc842f72a))
* **cockpit:** draw a prompt typed during a compaction as queued, never a numberless turn header ([#55](https://github.com/tashfiqul-islam/ghostframe/issues/55)) ([a6f86d9](https://github.com/tashfiqul-islam/ghostframe/commit/a6f86d989f38778525b67754b034b2068ec5a480))
* **cockpit:** draw task notices on the left's grid, wrapped and whole ([#40](https://github.com/tashfiqul-islam/ghostframe/issues/40)) ([84c894a](https://github.com/tashfiqul-islam/ghostframe/commit/84c894ae96af5ba0c0f202c89be62f9b0c48c941))
* **cockpit:** give timeline titles the pane's spare width, and cut values in the middle ([#43](https://github.com/tashfiqul-islam/ghostframe/issues/43)) ([47a3777](https://github.com/tashfiqul-islam/ghostframe/commit/47a377701027e28c2b4e95f4ef8d736a0e3dad07))
* **cockpit:** keep the pane fast whatever is untracked ([#46](https://github.com/tashfiqul-islam/ghostframe/issues/46)) ([9f5ebb9](https://github.com/tashfiqul-islam/ghostframe/commit/9f5ebb9eb570a6e11193a7184a7763ef5cd3497c))
* **cockpit:** keep the session's turns through a compaction, a reload and a resume ([#39](https://github.com/tashfiqul-islam/ghostframe/issues/39)) ([ce5b975](https://github.com/tashfiqul-islam/ghostframe/commit/ce5b975aaa39b72b316ba8575c4c8965c77d339d))
* **cockpit:** know every agent the session launched, and keep one row per waiting task ([#41](https://github.com/tashfiqul-islam/ghostframe/issues/41)) ([245d705](https://github.com/tashfiqul-islam/ghostframe/commit/245d70592435cbeb1551e5012894a391cadbac46))
* **cockpit:** name every Files row's file, and mark outside files instead of drawing a bar ([#51](https://github.com/tashfiqul-islam/ghostframe/issues/51)) ([58fef0a](https://github.com/tashfiqul-islam/ghostframe/commit/58fef0a536e17ec06f5ebb4c5042ea429759af4a))
* **cockpit:** say NEEDS YOU only while a person is asked, never while auto mode judges ([#44](https://github.com/tashfiqul-islam/ghostframe/issues/44)) ([0d2afa6](https://github.com/tashfiqul-islam/ghostframe/commit/0d2afa6f3631a8f2e98d1841d37a6a3f9a7fa126))
* **hooks:** draw a paste as Claude Code names it, never its wrapper tags ([#42](https://github.com/tashfiqul-islam/ghostframe/issues/42)) ([8d3ac2c](https://github.com/tashfiqul-islam/ghostframe/commit/8d3ac2c01b831ec361e4408c4157eebd42095701))
* **hooks:** draw finished replies whole and break words wider than the row ([#35](https://github.com/tashfiqul-islam/ghostframe/issues/35)) ([3f5c9db](https://github.com/tashfiqul-islam/ghostframe/commit/3f5c9db7e961494dec53ec5df89035ab609b5ac7))
* **hooks:** measure emoji at their real width and check the engine once for every first draw ([#34](https://github.com/tashfiqul-islam/ghostframe/issues/34)) ([ef8a16f](https://github.com/tashfiqul-islam/ghostframe/commit/ef8a16f133a0983834b700c46fc3f5539d123a1d))
* **statusline:** strip hostile names, shrink long names, and quote the command for the shell ([#36](https://github.com/tashfiqul-islam/ghostframe/issues/36)) ([05159fa](https://github.com/tashfiqul-islam/ghostframe/commit/05159fadba8216ae4223208238dae573be2dea79))
* **tooling:** block on a budget only when the pull request is over it, not the runner ([#61](https://github.com/tashfiqul-islam/ghostframe/issues/61)) ([e9f307d](https://github.com/tashfiqul-islam/ghostframe/commit/e9f307d6243540b156ce4f0ff2cb198c5784ff3c))


### Performance

* **cockpit:** draw a transcript row again with a few state reads, never every kept turn ([#45](https://github.com/tashfiqul-islam/ghostframe/issues/45)) ([da91c08](https://github.com/tashfiqul-islam/ghostframe/commit/da91c08422d82cd1a378558f2467b6ba764d9d71))
* **cockpit:** stop copying whole lists on every call and draw, and rate every pull request's speed ([#52](https://github.com/tashfiqul-islam/ghostframe/issues/52)) ([30417d6](https://github.com/tashfiqul-islam/ghostframe/commit/30417d6240a40d7eb77d0b4d02c19c48a2fcab8c))
* **hooks:** compare file lists by path and name any hook past 1 s of its own work ([#47](https://github.com/tashfiqul-islam/ghostframe/issues/47)) ([ddbc081](https://github.com/tashfiqul-islam/ghostframe/commit/ddbc0816fb2c2d4ba4e384b9d7febb548949c4d5))
* **tooling:** measure ghostframe against its budgets: profiler, fixtures, benchmarks, report CI ([#48](https://github.com/tashfiqul-islam/ghostframe/issues/48)) ([798dcb0](https://github.com/tashfiqul-islam/ghostframe/commit/798dcb0775d5109336725cac27035f61f3acd259))


### Docs

* **ci:** say the Conventional title check never skips, and why ([#78](https://github.com/tashfiqul-islam/ghostframe/issues/78)) ([f860a89](https://github.com/tashfiqul-islam/ghostframe/commit/f860a89c38f0a5cbf1a7cbd2c86e35df4236fddf))
* **docs:** website stack, architecture and agentic browsing (ADRs 0013–0028 accepted) ([#59](https://github.com/tashfiqul-islam/ghostframe/issues/59)) ([7d15343](https://github.com/tashfiqul-islam/ghostframe/commit/7d15343fe9460bb75f19a02a9e8cf0b0c22b4d28))


### Internal

* **cockpit:** read GHOSTFRAME_COCKPIT's words without the engine ([#33](https://github.com/tashfiqul-islam/ghostframe/issues/33)) ([b4f1232](https://github.com/tashfiqul-islam/ghostframe/commit/b4f1232518724d8b122b1e1b024422a6ceb348fc))
* **tests:** check figure and table drawing without the engine ([#32](https://github.com/tashfiqul-islam/ghostframe/issues/32)) ([392ab1c](https://github.com/tashfiqul-islam/ghostframe/commit/392ab1c1b347bb867257601b5cb8ad414b05cfa0))
* **tests:** give two heavy Cockpit tests the 15 s limit ([#30](https://github.com/tashfiqul-islam/ghostframe/issues/30)) ([e53963e](https://github.com/tashfiqul-islam/ghostframe/commit/e53963ea741a67dadf52343772e5c5b09c4fd3ea))
* **tests:** pin six transcript tests to Cockpit off ([#31](https://github.com/tashfiqul-islam/ghostframe/issues/31)) ([4bdb79c](https://github.com/tashfiqul-islam/ghostframe/commit/4bdb79cc134a75e22f484e727d21367a402beeb3))
* **tests:** time turn.step's own work in the 40,000-file test, not the runner's wall clock ([#54](https://github.com/tashfiqul-islam/ghostframe/issues/54)) ([1b2413e](https://github.com/tashfiqul-islam/ghostframe/commit/1b2413e0ae69fc661f6e517c9de00c81263426b3))

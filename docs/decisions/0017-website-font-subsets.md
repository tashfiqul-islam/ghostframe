# 0017. The website builds its own font subsets, with the terminal's glyphs

Status: proposed.

## Context

The designer's handoff uses Fontsource's `latin` files. They lack the glyphs the terminal grid draws with: box drawing
(`─` alone is used 2,364 times), block elements, `❯`, `→`, `↗` and the step glyphs. Checked with fontTools: the latin
JetBrains Mono file has none of U+2500, U+2580, U+276F or U+2713. A missing glyph falls back to a system font with
another width and breaks the 8 × 16 cell grid. JetBrains Mono itself covers U+2500–257F and U+2580–259F in full.

Measured ([fonts research](../design/website/research/04-styling-fonts-and-images.md)): Hanken Grotesk 400–800 subset
to the page's characters 15.7 KB; JetBrains Mono 400–500 with the box and block ranges and the used symbols, without
its code ligatures, 11.7 KB. The two latin files were 75 KB.

## Decision

The site subsets both variable fonts from the upstream google/fonts sources with fontTools, to the characters the
built pages use plus the box and block ranges, and commits the two woff2 files with the script that makes them. A test
fails the build when a character on a built page is not in the font that sets it.

## Consequences

- Adding copy with a new character fails the build until the subset is regenerated; the error names the character.
- `✓`, `↻`, `∴` and `▮` are in neither font. The build draws them another way (a decision for the design pass, not
  this record); the coverage test keeps it from slipping.
- fontTools is a Python tool, run only when the subset changes, pinned in `mise.toml`; the build itself does not
  need Python.

# 0017. The website builds its own font subsets, with the terminal's glyphs

Status: accepted.

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

`✓` (U+2713), `↻` (U+21BB), `∴` (U+2234) and `▮` (U+25AE) are in neither font. They come from a third woff2 holding
only those four code points, subset from JuliaMono v0.63.2 (SIL Open Font License 1.1). It is declared as its own
`@font-face` with `unicode-range: U+2713, U+21BB, U+2234, U+25AE`, listed after JetBrains Mono in the mono stack and
not preloaded, so a browser fetches it only for a page that draws one of them. Its face carries
`ascent-override: 102%`, `descent-override: 30%` and `line-gap-override: 0%`, JetBrains Mono's own metrics, so a
glyph from it never changes a line's height.

Measured with fontTools 4.69.1 on 2026-11-28, against JetBrains Mono 2.211 (advance 0.600 em, x-height 0.55 em):

| Font, licence                      |  Advance | `✓` | `↻` | `∴` | `▮` |
| ---------------------------------- | -------: | --- | --- | --- | --- |
| JuliaMono v0.63.2, OFL 1.1         | 0.600 em | yes | yes | yes | yes |
| Fira Code, OFL 1.1                 | 0.600 em | yes | no  | yes | yes |
| Noto Sans Mono, OFL 1.1            | 0.600 em | no  | no  | yes | yes |
| IBM Plex Mono, OFL 1.1             | 0.600 em | yes | yes | no  | no  |
| GNU FreeMono, GPL + font exception | 0.600 em | no  | yes | yes | yes |

JuliaMono's four glyphs advance exactly 0.600 em, their ink sits inside the cell (x 0.045 to 0.555 em), and its
x-height is JetBrains Mono's 0.55 em. The subset, without hinting or layout features, is 908 bytes. Fira Mono, Source
Code Pro, Roboto Mono, Red Hat Mono and Geist Mono hold at most one of the four.

## Consequences

- Adding copy with a new character fails the build until the subset is regenerated; the error names the character.
- The coverage test counts the glyph face as the font that sets those four code points.
- JuliaMono ships one weight per file; the glyph face uses Regular for 400 to 500 (`font-weight: 400 500`), so the
  browser does not synthesise bold. The OFL text ships beside the woff2.
- If a later JuliaMono drops a glyph or changes its advance, the subset script fails on it; the fallback then is an
  inline SVG sized to one cell.
- fontTools is a Python tool, run only when the subset changes, pinned in `mise.toml`; the build itself does not
  need Python.

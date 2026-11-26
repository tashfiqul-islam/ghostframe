# docs/assets

The README's screenshots, the status line spec's (`docs/design/statusline/*.png`), and what makes them.

- `captures/`: the source captures, each an `.html` page that draws every cell of a screen in its colours:
  - `readme-*.html` from step 14 of the live checks (`tools/live/shots.ts`): Claude Code at 200 × 50 with ghostframe
    as it ships, Cockpit on and the status line set up the way `/ghostframe-statusline install` sets it up;
  - `statusline-200-*.html` and `statusline-100-pressure.html` from step 13 (`tools/live/statusline.ts`): the status
    line in a real session, normal and under pressure;
  - `statusline-sheet-100.html` from `tools/live/sheet.ts`: the reference renderer and the renderer side by side, from
    sample data, with no session.
- `screenshots.ts`: renders the PNGs its `SHOTS` list names, at 2x, in a Nerd Font so the status line's icons show. It
  blanks Claude Code's welcome header (logo, model and plan, the project's path) on whole screens, and cuts the status
  line shots down to the rows they name.
- `readme-*.png`: the images the README and the release notes use.

## Regenerate them

1. Run steps 13 and 14 of the live checks, with their output outside the repository, and write the sheet:

   ```powershell
   cd tools/live
   $env:LIVE_OUT = "$env:TEMP\ghostframe-live"
   bun run.ts 13 14
   bun sheet.ts
   ```

2. Copy the captures into `captures/` under the names `SHOTS` uses: from `<run>\P200\`, `01-readme-hero.html`
   becomes `readme-hero.html` (and so on); from `<run>\S200\` and `<run>\S100\`, `01-statusline-normal.html` becomes
   `statusline-200-normal.html` and `02-statusline-pressure.html` becomes `statusline-200-pressure.html` or
   `statusline-100-pressure.html`. `sheet.ts` writes its capture in place.
3. Check the captures for anything personal before you commit them: a path with your user name, an email address.
4. Render the PNGs:

   ```sh
   cd docs/assets
   bun install --frozen-lockfile
   bun screenshots.ts
   ```

`screenshots.ts` drives your installed Chrome through `playwright-core`, which downloads no browser. Set
`SHOTS_CHANNEL=msedge` to use Edge. It needs the JetBrainsMono Nerd Font Mono installed, or another Nerd Font named
in `SHOTS_FONT`.

# docs/assets

The README's screenshots and what makes them.

- `captures/`: the source captures, each an `.html` page that draws every cell of a real session's screen in its
  colours. They come from step 14 of the live checks (`tools/live/shots.ts`): Claude Code at 200 × 50 with ghostframe as
  it ships, Cockpit on and the status line set up the way `/ghostframe-statusline install` sets it up.
- `screenshots.ts`: renders each capture to a PNG here at 2x, in a Nerd Font so the status line's icons show.
- `readme-*.png`: the images the README and the release notes use.

## Regenerate them

1. Run step 14 of the live checks, with its output outside the repository:

   ```powershell
   cd tools/live
   $env:LIVE_OUT = "$env:TEMP\ghostframe-live"
   bun run.ts 14
   ```

2. Copy the step's three captures from `$env:LIVE_OUT\<run>\P200\` into `captures/`, dropping the number in front of
   each name: `01-readme-hero.html` becomes `readme-hero.html`.
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

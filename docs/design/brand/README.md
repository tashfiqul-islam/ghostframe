# ghostframe brand

The mascot is ghostframe's brand mark for everything outside the terminal: the website, README, GitHub, docs and social cards. Inside Claude Code, the status line uses the obsidian half-block ghost instead, because Claude Code can only draw text characters. See `docs/design/statusline.md`.

Locked 2026-11-26.

## Files

| Path | Use |
|---|---|
| `ghostframe-mascot.svg` / `-4096.png` | Full-colour mascot, gold eyes. The master artwork. |
| `ghostframe-mascot-{green,amber,red}.svg` | The three eye states (green under 60%, amber 60–84%, red 85%+). Amber is the brand default. |
| `ghostframe-mark-small-{green,amber,red}.svg` | Bust crop tuned for small sizes (thicker edges, more contrast, no eye glow). Use below about 64 px. |
| `ghostframe-logo-{white,black}.svg` / `-4096.png` | One-colour mark, for single-colour printing, stamps and watermarks. |
| `ghostframe-wordmark-{white,black}.svg` | "ghostframe" in Hanken Grotesk Bold, converted to vector outlines (no font needed). |
| `ghostframe-lockup-{dark,light}.svg` | Mascot and wordmark side by side. The default logo. |
| `ghostframe-lockup-stacked-{dark,light}.svg` | Mascot above the wordmark, for square spaces. |
| `avatar-1024.png` | GitHub org/profile picture and other round avatars. |
| `icons/` | `favicon.ico` (16/32/48), `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `site.webmanifest` |
| `social/og-image.png` | Open Graph image, 1200×630. |
| `social/twitter-card.png` | X/Twitter large card, 1200×600. |
| `social/github-social-preview.png` | GitHub repo social preview, 1280×640. Upload in Settings → General → Social preview. |
| `readme/readme-hero-{dark,light}.png` | README header, 1600×420 at 2×, rounded corners, transparent outside. |
| `head.html` | The `<head>` tags for a website: icons, manifest, Open Graph and X cards. |

`{dark,light}` means "for a dark background" and "for a light background".

## README header

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/design/brand/readme/readme-hero-dark.png">
  <img alt="ghostframe: the cockpit for Claude Code" src="docs/design/brand/readme/readme-hero-light.png">
</picture>
```

## Construction

- Hooded skull with `< >` brackets, built from exact straight-edged vector shapes. The two halves are mirror images about the vertical centre line, and every corner is a true point.
- The wordmark is Hanken Grotesk Bold with −0.025 em tracking, converted to outlines.
- In the horizontal lockup, the wordmark's ascender is 42% of the mascot's height, and its x-height is centred on the face.

## Type

- **Display and UI:** Hanken Grotesk (600, 700, 800).
- **Mono and labels:** JetBrains Mono (400, 500), uppercase with wide tracking for small labels.

## Palette

| Role | Hex |
|---|---|
| Background | `#0B0B0E` |
| Light background | `#F3F1F7` |
| Text on dark | `#ECEAF2` |
| Secondary text | `#8C8899` |
| Hood, top → bottom | `#4C4956` → `#34323C` → `#26242D` |
| Hood edge highlight | `#EDEAF4`, fading down |
| Skull, top → bottom | `#F2F0F6` → `#B8B3C4` |
| Brackets, top → bottom | `#8A8696` → `#5E5A69` |
| Gold eyes (brand) | `#FFF3C9` → `#FFC83D` → `#FFA21A` |
| Green eyes | `#E6FFF2` → `#5BEBA6` → `#19B871` |
| Red eyes | `#FFD6DA` → `#FF5566` → `#D9163A` |

The three eye colours match the status line's thresholds and the ghost's eyes there (green `#5BEBA6`, amber `#FAB387`, red `#D7263D`).

## Do

- Use the lockup as the default logo, and the mascot alone where the name is already nearby.
- Give the mark clear space of at least a quarter of the mascot's width on every side.
- Use the small mark below about 64 px.

## Don't

- Recolour the hood or skull, or change the eye colours outside the three states.
- Stretch, rotate, outline or add effects.
- Put the full-colour mascot on busy photos. Use the one-colour mark there.

## Note

The mascot's shape derives from an AI-generated source image. US copyright may not protect AI-generated work. Before registering it as a trademark, have a designer redraw the final mark by hand.

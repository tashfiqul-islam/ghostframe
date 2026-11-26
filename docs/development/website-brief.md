# Design brief: the ghostframe website

You're designing the website for **ghostframe**, an open-source plugin for Claude Code. I want something people screenshot and share: an Awwwards-level site with a dark, ghost-in-the-machine hacker atmosphere, executed with the restraint and precision of the best developer-tool sites of 2026. Push your boundaries on concept, motion and craft. Never trade clarity or speed for spectacle.

Read the whole brief before you start. The brand assets I've attached are final: use them as they are, never redraw or "improve" them.

---

## 0. How to work: the design skills

Three design skills are installed for this job. Each has one role. Use them in this order, and don't let them overrule this brief: **where a skill's default conflicts with the brand or content here, the brief wins.** In an independent test, Impeccable drifted away from the brand's real palette, so lock the tokens in section 2 before you design anything.

1. **Impeccable (pbakaus/impeccable): the primary design skill.** Follow its full workflow, not just its rules:
   - write the product brief (its `shape` step) from sections 1 to 4 of this brief before drawing anything;
   - design, then review your own screenshots at every breakpoint, and fix what you find, before showing me;
   - run its `critique` and `audit` passes on each direction and on the final design, and its `polish` pass at the end;
   - in the build, run `npx impeccable detect` on the output and fix every finding. It becomes a CI check.
2. **Emil Kowalski's design engineering skill (emilkowalski/skill): motion and interaction only.** Use it for every animated moment: whether it should animate at all, which property, curve and duration, press and hover states, hit areas, and reduced motion. Don't use it for layout or visual direction. The motion spec in section 7 must follow its rules, and its `review-animations` pass reviews the final motion.
3. **Vercel's Web Interface Guidelines (vercel-labs/agent-skills, web-design-guidelines): the final audit.** Run it on the built code before calling anything done, and fix every finding. It fetches the latest guidelines itself.

**Rules for using them:**

- One skill per role. Don't load other design skills at the same time (frontend-design, Hallmark, UI/UX Pro Max, Taste Skill and others): overlapping rules conflict.
- A clean audit is the floor, not the goal. Zero anti-patterns doesn't make a page good. The concept, hierarchy and craft in this brief do.
- In each report, list which skill steps you ran, what they flagged, and what you changed. If a skill isn't available in your environment, say so at the start and apply the same principles from this brief instead; don't pretend you ran it.

---

## 1. The product

**ghostframe: the cockpit for Claude Code.** It's a plugin that changes how Claude Code looks and feels in the terminal. It runs inside the user's own Claude Code session. It has two parts.

**Cockpit: a redesigned chat UI.**

- A turn timeline down the left: every step the agent takes, in order, with timing.
- A docked side pane with five tabs: Timeline, Files (what changed), Sources (what it read or fetched), Todo, and Agents (sub-agents running in parallel).
- Receipts and failure cards: clean summaries of what a turn did, or why it failed.
- Rewind: step back through a session.
- A fallback mode that works without the pane on narrow terminals.

**The status line: two rows at the bottom of the terminal.**

- The model and effort level, the repo and branch, and the lines changed (or the pull request that needs attention).
- Three budget tiles, each with a segmented meter: **context**, the **5-hour** limit and the **week** limit. The 5-hour and week tiles also show reset times, and a pace marker that shows whether you're burning faster than an even pace.
- A small pixel ghost on the left whose **eyes change colour with pressure**: green under 60%, amber from 60 to 84%, red from 85%.
- It's installed with one command, `/ghostframe-statusline install`. The command asks before changing anything, keeps a backup, and uninstalls cleanly.

**Facts to respect:**

- Runs wherever the official Claude Code CLI runs: Windows, macOS, Linux, Windows Terminal, the terminals in VS Code, Cursor and JetBrains, and terminal-hosting IDEs like Orca.
- It doesn't run in other agent harnesses (OpenCode, Codex and so on).
- It's version 1.0.0, the first public release.
- Open source on GitHub: github.com/tashfiqul-islam/ghostframe.
- Privacy: ghostframe runs locally inside your Claude Code session and changes only how it's displayed. Put this on the page as **[TO CONFIRM]**; I'll verify the exact wording against the code.

**Audience:** developers who live in the terminal with Claude Code all day. They're sharp, allergic to marketing, and impressed by craft, speed and honesty. Talk to them like an engineer, not a growth marketer.

---

## 2. Brand (final, don't redesign)

**The mascot:** a hooded figure whose face is a skull with angular, glowing gold eyes, and `< >` code brackets on its cheeks. It's built from sharp, symmetric vector planes: a graphite hood with a thin highlight on its top edges, an ash-white skull, gunmetal brackets. The wisps at the bottom taper into points like smoke.

- The mascot is the brand everywhere outside the terminal.
- Inside the terminal, the status line uses a tiny pixel ghost instead, because the terminal can only draw text characters.
- **That relationship is the core story:** the ghost lives in the frame.

**Wordmark:** "ghostframe", all lowercase, Hanken Grotesk Bold, tight tracking.

**Tagline:** "The cockpit for Claude Code."

**Type:**

- Hanken Grotesk (600/700/800) for display and UI.
- JetBrains Mono (400/500) for code, terminal and labels. Small labels go uppercase with wide tracking (about 0.12–0.14em).
- Self-host both as woff2.

**Colour:**

| Role                | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| Background          | `#0B0B0E` (deepest `#060608`)                            |
| Raised surfaces     | `#111117`, `#17171F`                                     |
| Hairlines           | `#1E1D24`, `#2A2A34`                                     |
| Text                | `#ECEAF2`                                                |
| Secondary text      | `#8C8899`                                                |
| Muted text          | `#6E6A7A`                                                |
| Brand accent (gold) | `#FFC83D`, with `#FFF3C9` highlights and `#FFA21A` depth |
| Status: calm        | green `#5BEBA6`, teal `#7EC8BE`                          |
| Status: busy        | amber `#E8B98A` / `#FAB387`                              |
| Status: hot         | red `#EC84A0` / `#D7263D`                                |
| Hood graphite       | `#4C4956` → `#26242D`                                    |

- Gold is rare and precious: the eyes, the primary call to action, focus rings. It isn't a theme colour to splash around.
- The green, amber and red status colours belong to the product's meters and the eye states. Use them where they mean something.
- Dark is the default. A light theme is optional, and only if it's as good as the dark one; `#F3F1F7` is the light background.

**Voice:** plain, specific, short sentences. Say what a thing does. No hype words: no "unleash", "supercharge", "revolutionary", "seamless", "next-level". No emoji.

**Attached assets:**

- `ghostframe-mascot.svg` (master, gold eyes) and `ghostframe-mascot-{green,amber,red}.svg` (the three eye states)
- `ghostframe-lockup-{dark,light}.svg` and `ghostframe-lockup-stacked-{dark,light}.svg`
- `ghostframe-wordmark-{white,black}.svg`
- `readme-hero-dark.png` and `og-image.png`, for reference on how the brand has been composed so far
- status line screenshots (normal and under pressure); Cockpit screenshots if I've attached them
- `head.html` (meta tags), `icons/` (favicons, app icons, site.webmanifest) and `social/` (OG and X cards)

---

## 3. Creative direction

**The concept to build around: "the ghost in the frame."** The mascot is a presence that lives inside your terminal and watches your session. The site should make that tangible: dark, quiet and precise, with something alive in it.

**The mood:**

- terminal-native luxury: obsidian, graphite, hairline grids, monospace detail, and one warm light source, the gold eyes;
- the feel of a high-end instrument panel or a mission-control console, not a cyberpunk poster;
- hacker atmosphere through _details_: scanline texture at about 2–3% opacity, a faint grid that fades at the edges, glyphs and cell-grid alignment, cursor blinks, characters resolving into place. Never neon overload or Matrix rain.

**Signature moments.** Explore these, choose the strongest, and make them exceptional:

1. **The hero presence.** The mascot rendered with depth: subtle volumetric smoke drifting through the hood, the eyes glowing and catching light, a slow idle "breath". The eyes follow the cursor very slightly.
2. **The eyes are the site's state.** The eyes go from gold (brand) to green, then amber, then red, tied to a story: for example, as you scroll through the status line section, a simulated session's budget climbs, the meters fill, and the eyes shift colour. This is the site's own living status line.
3. **Mascot to pixel ghost.** A transition where the HD mascot dissolves into terminal cells and resolves as the tiny half-block ghost sitting in a status line: the mascot "entering the frame". Make it a scroll-driven moment that explains the brand.
4. **A real terminal, not a screenshot.** Rebuild Cockpit and the status line as a live HTML/CSS cell grid in JetBrains Mono, pixel-true to the screenshots, with a scripted session playing: a prompt is typed, the turn timeline fills step by step, the pane's tabs light up, files appear, a receipt lands, the budget meters tick up. Visitors can click the pane tabs. This is the product demo, and it should feel more real than a video.
5. **Install as a ritual.** Copyable commands with OS tabs (Windows, macOS, Linux). Copying triggers a small terminal-style confirmation. The install section ends with the status line "booting": meters drawing in segment by segment.

**3D and WebGL:** Three.js (or react-three-fiber) is welcome for **one** hero piece at most: the smoke and depth around the mascot, or a particle and cell-grid field the mascot emerges from.

- Lazy-load it, and keep it under about 150 KB gzipped.
- Show a crisp static fallback (the SVG mascot) until it's ready, and on low-power devices, without WebGL, and under `prefers-reduced-motion`.
- If a piece of 3D doesn't clearly beat a well-made 2D or CSS version, use the 2D version.

**Motion principles:**

- Every animation explains or rewards something. No motion for its own sake.
- Easing: a confident ease-out (about `cubic-bezier(.2,.8,.2,1)`). Durations of 180–600 ms; long scroll-scrubbed sequences only for the signature moments. Staggered reveals of 30–60 ms per item. No bounce, no elastic.
- Use CSS scroll-driven animations where they're enough; use Motion (Framer Motion) or GSAP for orchestration, not both.
- Hold 60 fps on a mid-range laptop. Under `prefers-reduced-motion`, everything becomes calm fades and static states, and the page still tells the full story.

**Avoid AI slop.** None of these:

- purple, blue or pink gradients, or glassmorphism on everything;
- generic three-up feature cards with icon, title and two lines;
- bento grids filled with icons and nothing real;
- floating 3D blobs, orbs or stock abstract shapes;
- fake testimonials, fake logos ("trusted by"), fake metrics, made-up download counts;
- lorem ipsum (where real content is missing, write `[TBD: what goes here]`);
- emoji as decoration, sparkle icons, "AI" glow clichés;
- centred-everything layouts; every section looking the same.

**What to do instead:**

- Real product UI as the visual material.
- A strong typographic hierarchy, with the very large wordmark used as a graphic element.
- Asymmetric, editorial layouts on a strict 12-column grid with deliberate breaks.
- Generous negative space, and hairline structure.

---

## 4. Information architecture

One long landing page plus a few small pages. Suggested order; improve it if you have a stronger narrative:

1. **Nav:** lockup, then Features, Status line, Install, Docs (links to GitHub docs) and GitHub (with the star count only if it's fetched live; no hardcoded numbers). A version chip, `v1.0.0`, linking to the changelog.
2. **Hero:** the mascot presence, the wordmark, the tagline, one sentence of explanation, a primary call to action (Install), a secondary one (View on GitHub), and the install command, copyable, right there.
3. **What it is:** three or four sentences, plus the "ghost in the frame" idea.
4. **The live terminal demo:** the signature moment 4 above, with Cockpit.
5. **Cockpit features:** timeline, pane tabs, receipts and failure cards, rewind, fallback. Each shown with a focused crop of the real UI, not an icon.
6. **The status line:** a deep dive with the budget story and the eye states (signature moment 2), and an interactive slider that sets the usage so visitors can watch the meters and eyes react.
7. **Mascot to pixel ghost:** signature moment 3, which can bridge sections 6 and 7.
8. **Install:** OS tabs, the plugin install commands, `/ghostframe-statusline install`, requirements (Claude Code version, Bun for the status line, a Nerd Font for icons, minimum terminal width), and how to undo it.
9. **Compatibility:** where it runs and where it doesn't, as a clean matrix with honest "tested", "CI-only" and "untested" labels.
10. **How it works:** a small, beautiful architecture diagram (engine hooks → store → renderers → timeline, pane and status line), drawn in the site's own visual language.
11. **Privacy:** one calm statement ([TO CONFIRM], see section 1).
12. **FAQ:** an accordion with 5 to 7 real questions.
13. **Footer:** a large wordmark, links, the licence, "Not affiliated with Anthropic.", and the mascot watching quietly.

**Extra pages:** a 404 (the ghost, lost in an empty terminal: make it delightful) and a changelog page that renders the GitHub Releases.

---

## 5. Design system and components

- **shadcn/ui style:** Radix primitives, Tailwind CSS v4, a CSS-variable token layer (colour, type scale, spacing, radius, shadow, motion). Customise everything to the brand; nothing should look like default shadcn.
- **Components:** button (primary gold, secondary hairline, ghost), the copyable code and command block with OS tabs, tabs, accordion, tooltip, the version chip, the status tile and meter (reused from the product), the terminal window frame, a section header with a mono eyebrow label, and the compatibility matrix.
- **Type scale:** a fluid display size for the wordmark moments (`clamp`), with a clear step down to H2, H3, body and mono labels. Line length 60–72 characters for prose.
- **Radius:** small and precise (4–10 px), with no pill-everything. **Shadows:** almost none; separate with hairlines and surface steps.
- **Focus states:** visible gold rings, on everything interactive.

---

## 6. Technical constraints

- **Static site,** deployable to Cloudflare Pages (preferred) or GitHub Pages.
- **Stack I recommend:** Astro 5 with React islands for the interactive parts, Tailwind v4 and shadcn/ui. If you'd choose differently, say why in one paragraph.
- **Performance:**
  - Lighthouse 95+ on every category, mobile included;
  - LCP under 1.8 s and CLS 0;
  - total JavaScript on first load under about 120 KB gzipped, with the 3D piece lazy-loaded on top;
  - fonts preloaded and subset, with `size-adjust` so they cause no layout shift;
  - images in AVIF or WebP with sizes set.
- **Accessibility:** WCAG 2.2 AA contrast; full keyboard navigation; the terminal demo has a pause control and a text alternative; screen-reader labels on every meter (for example "Context 72%, amber").
- **Responsive:** design at 1440, 1024, 768 and 390 wide. On mobile, the terminal demo becomes a cropped, swipeable view, never a squashed one.
- **SEO and social:** use the `head.html` tags and the `og-image.png` and `twitter-card.png` provided; a canonical URL, a sitemap and robots.txt; structured data (`SoftwareApplication`).

---

## 7. What I want from you, in order

1. **Impeccable's product brief** (one page, from sections 1 to 4), then **three distinct creative directions,** each with a name, a one-paragraph concept, the hero composition, how the signature moments would feel, and a key frame or two. Make them genuinely different (for example: an instrument-panel precision direction, a cinematic smoke-and-light direction, and a cell-grid "everything is a terminal" direction). Recommend one, and say why.
2. After I pick, the **full design:**
   - the landing page at 1440 and 390;
   - the 404;
   - the component sheet with tokens;
   - a **motion spec** for every animated moment: trigger, duration, easing, what moves and the reduced-motion version.
3. Then the **build:** a clean, well-structured codebase:
   - components, sections, lib and content separated;
   - content in typed data files, not hardcoded in markup;
   - the scripted terminal session defined as data, so it's easy to edit;
   - a README covering local dev, build and deploy to Cloudflare Pages.

4. **Before every handoff:** Impeccable's critique and audit, Emil's animation review on anything that moves, and in the build, `npx impeccable detect` plus the Web Interface Guidelines audit, with all findings fixed or explained.

Quality bar: if a detail would make a designer at Linear, Vercel or Raycast wince, fix it. Align everything to the grid, make every hover state intentional, make every number real.

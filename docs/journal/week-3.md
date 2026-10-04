# MonAmi - Week 3

## Week of: September 6-12, 2026

## My goal this week

Lock one contract for spacing, theme, and component states after two weeks of per-component graph, sidebar, and mobile fixes.

## What I did

- I wrote `DESIGN-SYSTEM.html` from scratch (`0b8f2e4`, +923 lines): tokens (`--bg-main`, `--text-primary`, `--primary-accent`), `data-theme` dark/light contract with star-field dark background, app shell, graph legend, cards, badges, buttons, focus ring, and animations.
- I condensed it (`8652e7e`, 34+/24-).
- I fixed the settings background drifting off-theme with a 1-line fix in `src/app/globals.css` (`b3b9c99`).

## What blocked me

- My first spec ran long, so I cut 24 lines the same week.
- The Settings page drifted off-theme, which is exactly the kind of drift the spec is supposed to prevent.

## What I learned

- After weeks of scattered fixes, one file to check every screen (graph, Discover, settings) against is faster and calmer.
- Theme contracts need a real check on every page, not just the main one.

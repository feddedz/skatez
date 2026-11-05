
## Run it locally

Browsers block ES modules from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Keys | Action |
| --- | --- |
| W / ↑ | Push |
| S / ↓ | Brake |
| A D / ← → | Steer · spin in the air · balance while grinding |
| Space | Hold to crouch, release to ollie (hold longer = higher) |
| J / K / L / I | Kickflip / Heelflip / Pop Shove-It / Impossible (in the air) |
| H (hold) | Indy grab |
| R | Reset to start |
| P / Esc | Pause |
| M | Mute |

On phones: drag anywhere on the left half to steer (up = push, down = brake); trick buttons are on the right.

**Scoring:** every trick adds points and bumps the multiplier. After you land, a bar under the combo drains for about a second — pop again before it empties and the combo keeps going (chain ollies, flips, grabs and grinds for huge numbers). When it runs out, the combo is banked as points × multiplier, with a rating from NICE up to LEGENDARY. You only bail if you land nearly sideways or start a flip right before touching down. Each S-K-A-T-E letter is worth 500, and collecting all five adds a 2,000 bonus.

## Files

- `index.html` — page, HUD, menus, styles
- `game.js` — the whole game (scene, park, physics, tricks, scoring, audio, input)
- `.nojekyll` — tells GitHub Pages to serve files as-is

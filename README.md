# Concrete Wave 🛹

A 3D skateboarding game that runs entirely in the browser. Built with [Three.js](https://threejs.org) (loaded from a CDN), no build step, no dependencies to install.

**Features:** an animated skater (pushing, crouch-and-pop ollies, tucked flips, grabs, grind balancing, wipe-outs, fist pumps) · a skatepark with four quarter pipes, a funbox, kickers, a gap, a stair set with handrail, ledges and rails · ollies, kickflips, heelflips, shove-its, impossibles, grabs and spins · 50-50 grinds and boardslides with a balance meter · combo multiplier scoring · 2-minute sessions with a saved high score · S-K-A-T-E letters to collect · sparks, dust, slow-mo hang time and screen shake · procedural sound · touch controls on phones.

## Put it on GitHub Pages

1. Create a new repository on GitHub (e.g. `skate`).
2. Upload `index.html`, `game.js`, `.nojekyll` and this README to the root of the repo (drag them into the "Add file → Upload files" page, or `git push` them).
3. Go to **Settings → Pages**, under **Build and deployment** pick **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

> Name the repo `<your-username>.github.io` instead if you want it at the root of your GitHub Pages domain.

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

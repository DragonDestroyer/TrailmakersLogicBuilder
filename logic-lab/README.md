# Trailmakers Logic Lab

Simulator for Trailmakers logic blocks: gates, math, sensors, servos, thrusters, hue lights, and RC. A signal is on when it is not zero. Gate outputs are `output scale × clamp(sum, -1, 1)`, and only when that gate’s condition passes. Math blocks do not clamp.

The original static editor (`index.html`, `editor.js`, `editor.css`) is unchanged. This folder is the newer lab.

## Layout

- `src/lib/logic/` — block catalog, 60 Hz engine, TML2 codec, examples, in-game mod source, zustand store
- `src/components/logic-lab.tsx` — canvas, inspector, export
- `src/styles.css` — palette (ink, signal cyan, gate orange)
- `public/favicon.svg`

Imports use the `@/` alias (`@/lib/logic/...` → `src/lib/logic/...`) and `zustand`.

## In the game

Trailmakers’ supported Lua API cannot place or wire builder logic. Export writes a `TML2` code plus `main.lua` / `mod.json` that walk the build one step at a time. You still place the blocks yourself.

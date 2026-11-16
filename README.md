[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Flyrinnn13001/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Flyrinnn13001/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

# CROSSYARD — a three.js tactical FPS

A round-based tactical shooter in the style Counter-Strike made famous,
built for make.fun's `threejs-fps-01` bounty. Two teams of five fight over
a dusk freight yard: the **Kestrels** (attackers) plant the charge at
**the Yard**, the **Bastion** (defenders) hold it. First to 7 rounds wins.

## How it plays

- **First-person view** with pointer-lock mouse aim, WASD movement,
  acceleration, crouching, jumping and map collision.
- **Gunplay where accuracy beats speed**: spread and recoil grow while
  moving and shrink while stopped and crouched; headshots multiply damage.
  Four weapons (P9 Sidearm, Ripper SMG, KR-7 Rifle, Longbow DMR with a
  right-click scope) plus frag, smoke and flash grenades.
- **Tactics**: plant/defuse objective, per-round economy (kill $300, win
  $2,700, loss $1,900 + streak bonus) and a buy menu between rounds.
- **Bots** that follow lane routes, hold defender posts, rotate when the
  charge is planted, react to what they see and hear, and fight in bursts
  with aim error — they never freeze, because every state falls back to a
  movement wish.
- **Original map**: a 68×48 m freight yard with a warehouse, container
  lanes, crates and sightlines, lit by a low dusk sun. All art is
  procedural (canvas textures, three.js geometry) and all sound is
  synthesised in WebAudio — no assets, no network requests.

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, click **PLAY**, click the game to lock
the mouse. Keys: WASD move, click fire, R reload, 1–4 weapons, 5–7
grenades, B buy, E plant/defuse, C crouch, right-click scope (Longbow).

Staged screenshot scenes (deterministic, seeded): `?shot=start|play|end&seed=N`.

## Layout

```
game/
  index.html          page shell + import map for three.js 0.187.0
  src/
    config.js         tunables, palette, weapons, economy, spawns
    rng.js            mulberry32 + helpers (deterministic per round)
    map.js            obstacles, 47 waypoints, BFS, line of sight, collision
    world.js          three.js scene, textures, avatars, tracers, smoke
    agents.js         agent state + shared fixed-step movement
    weapons.js        hitscan, spread/recoil, reload, grenades
    bots.js           BotBrain state machine (perception, routes, plant/defuse)
    audio.js          WebAudio-synthesised sound effects
    input.js          keyboard + pointer-lock mouse
    hud.js            DOM HUD, buy menu, kill feed, banners
    main.js           match state machine + fixed 1/60 s loop
  vendor/three/       three.js 0.187.0, vendored byte-for-byte
main.ts               entry program: copies game/ + screenshots/ to /output,
                      writes dossier.json via vendor/makefun-threejs.ts
serve.ts              dev server
screenshots/          three real renders of the game
```

## Hand in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for make.fun's "Make the best three.js tactical FPS"
bounty, $1,000 in USDC.

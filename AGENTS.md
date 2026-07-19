# AGENTS.md

## What this is

A course assignment (CMPM 118) building an MCP server that lets an LLM assemble
a monster sprite (body/arms/legs/eyes/mouth/antennas) in a live Phaser browser
game, using art from Kenney's Monster Builder Pack (`assets/`). The core tool
surface (`create_body`, `add_arms`, `add_legs`, `add_eyes`, `add_mouth`,
`add_antennas`, `build_monster`, `get_monster_state`, `take_screenshot`,
`remember`/`recall`) is implemented, plus color instrumentation
(`describe_monster_colors`, multiplicative-tint-aware replies), a per-series
gallery with reproducible sidecars, and an experimental-command escape hatch
(`experimental_command`/`list_experimental_commands`) for extending the toolkit
at runtime — see "Rules of engagement" below.

## Architecture

```
MCP client ──(stdio)──> Phaser MCP server (Node, index.js)
                       │  also runs a WebSocket server on port 8081
                       ▲
                       │  (WebSocket — the browser connects OUTWARD to the server)
               Phaser game (browser, main.js/scene.js/parts.js via index.html)
```

- **`index.js`** — Node process. Registers MCP tools with `@modelcontextprotocol/sdk`
  (stdio transport) AND runs a `ws` `WebSocketServer` on port **8081**. Each tool
  handler calls `sendToGame(command, params)`, which sends a `{id, command, params}`
  JSON message over the socket and returns a Promise that resolves when the browser
  replies with a matching `id`. Requests **timeout after 5 seconds** if the game
  doesn't respond, and fail immediately with `'No game connected...'` if no browser
  tab is open.
- **`index.html` / `main.js` / `scene.js` / `parts.js`** — Plain browser scripts
  (no bundler, loaded via `<script>` tags in this exact order: `parts.js` →
  `scene.js` → `main.js`). Loads Phaser 4 from a CDN. `MonsterScene` connects
  *out* to `ws://localhost:8081`, auto-reconnecting every 1s on close.
- **`assets/`** — Kenney Monster Builder Pack PNGs. Filenames encode
  color/shape/variant, e.g. `body_blueA.png`, `arm_redC.png`, `leg_darkE.png`,
  `mouthA.png`..`mouthJ.png`, `detail_{color}_antenna_{small|large}.png`,
  `eye_*.png`. `parts.js` documents the naming pattern per part type.

## Rules of engagement — extending the toolkit

The agent is permitted, and encouraged, to extend its own toolkit when it hits an
expressive wall. That privilege comes with rules:

1. **`scene.js` may be edited freely, but new capabilities go in the experimental
   registry (`this.experimental` in `create()`), never as new `switch` cases in
   `executeCommand`.** The registry's shape is what guarantees every capability
   ships with a description — a raw `case` doesn't enforce that.
2. **Every registry entry needs an honest, specific description.** Bad:
   `'adds arm'` — tells you nothing about what makes it different from `add_arms`.
   Good: `'Place ONE arm on the given side only (no mirroring). Pose D dangles
   limply, good for weary characters.'` — names the constraint (no mirroring) and
   the payoff (what pose D is for). Write the description you'd want to read cold
   in a future session with no other context.
3. **`index.js` is edited only during promotion** — turning a proven experimental
   command into a real `registerTool` with a proper Zod schema. Outside of
   promotion, leave `index.js` alone. The bridge and queue plumbing in *both*
   files (`wss`/`sendToGame` in `index.js`; `connectToBridge`/`commandQueue`/
   `update()` in `scene.js`) is off-limits entirely — it's what keeps the two
   processes talking, and breaking it kills the session.
4. **One series name per style, identical to the memory style tag.** Use that
   exact name in every `take_screenshot` and `remember` call for that style —
   memory and gallery share one namespace.
5. **Git commit before every iteration.** Any broken edit is then one
   `git checkout` from recovery, and the commit history doubles as a record of
   what the agent built and when.

## Critical gotcha: command flow across two threads/processes

- The Node side (`index.js`) and browser side (`scene.js`) are **separate
  processes** connected only by WebSocket messages. There is no shared memory.
- In `scene.js`, `ws.onmessage` **must never touch Phaser game objects
  directly** — it only pushes to `this.commandQueue`. Actual mutation happens
  in `update()`, which drains the queue and calls `executeCommand()` on
  Phaser's own tick. This avoids races with Phaser's render/update cycle.
  Follow this pattern for any new command handling.
- Every command's `executeCommand` case must `return` a string (success or
  error) — `update()` sends that string back over the socket as `{id, result}`,
  which is what resolves the pending Promise in `index.js`.

## Adding a new MCP tool (the repeated pattern)

1. In `index.js`, `server.registerTool('tool_name', { description, inputSchema: z.object({...}) }, async (params) => { ... await sendToGame('tool_name', params) ... })`.
   Wrap the `sendToGame` call in try/catch and return
   `{ content: [{ type: 'text', text: ... }], isError: true }` on failure (see
   `create_body` for the exact shape).
2. In `scene.js` `executeCommand`, add a `case 'tool_name':` that reads
   `params`, mutates `this.monster`, and returns a description string.
3. In `scene.js` `preload()`, make sure the relevant texture keys are loaded
   (follow the nested-loop pattern used for body: `for (color) for (shape) this.load.image(key, 'assets/${key}.png')`).
4. Store created/replaced Phaser image objects on `this.monster.<part>` so
   `clearMonster()` (which iterates `Object.values(this.monster).flat()` and
   calls `.destroy()`) cleans them up. Parts that can appear multiple times
   (eyes, antennas) should be stored as arrays so `.flat()` picks them up.
5. Use `PARTS.<part>.offset` (and `.spacing` for paired parts like eyes/antennas)
   from `parts.js` for positioning relative to `CENTER_X`/`CENTER_Y`.

## Current state / known limitations

- All core part tools, `build_monster`, `get_monster_state`, per-series
  `take_screenshot`, `describe_monster_colors`, `remember`/`recall`, and the
  experimental-command escape hatch are implemented and working.
- `this.experimental` (the registry in `scene.js` `create()`) starts **empty**
  — it's seeded only with a commented example. `list_experimental_commands`
  will correctly report "No experimental commands yet" until the agent adds
  entries.
- `get_monster_state` (and therefore the `take_screenshot` JSON sidecars it
  feeds) only captures each part's **texture key** — not tint, scale, angle,
  or position. A sidecar can tell you *what parts* a monster used, but can't
  fully reconstruct its exact look. Worth richening if exact reproducibility
  becomes load-bearing.
- `gallery/monster_1.png` .. `monster_11.png` are legacy flat-numbered shots
  from before the per-series `gallery/<slug>/NNN.png` + `NNN.json` structure
  existed. They're harmless leftovers, not part of any series.

## Running / testing

- No test suite (`npm test` is a placeholder that exits 1 — don't try to fix
  this unless asked, it's intentionally unset for the assignment).
- To run: serve `index.html` with a static file server (browser must load it
  over HTTP, not `file://`, since Phaser/WebSocket needs a proper origin) AND
  separately run the MCP server (`node index.js`) so it's available to an MCP
  client via stdio. The WebSocket port (8081) is hardcoded in both `index.js`
  and `scene.js` — keep them in sync if changed.
- There is no build step; both server and client code run directly (`"type":
  "module"` in `package.json`, native browser `<script>` tags — no bundler).
- Verify manually: open the served `index.html`, confirm the on-screen status
  text turns "bridge connected" (green), then invoke MCP tools from a client
  and watch the monster update in the browser.

## Conventions observed

- Texture key naming: `{part}_{color}{shape}` for body/arm/leg (e.g.
  `body_blueA`), `{part}{shape}` for mouth (e.g. `mouthA`), `detail_{color}_
  {detail}_{size}` for antenna/horn/ear details, `eye_{style}` for eyes (many
  eye variants have no color axis — check `assets/` before assuming a naming
  scheme).
- All coordinates are absolute pixels on an 800x600 canvas (`CENTER_X=400`,
  `CENTER_Y=300` in `parts.js`); part offsets are relative to body center and
  explicitly called out in `parts.js` as approximate/tunable.
- `console.error` (not `console.log`) is used for MCP server status/logging —
  intentional, since stdout is reserved for the MCP stdio protocol.

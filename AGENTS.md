# AGENTS.md

## What this is

A **starter/incomplete** project for a course assignment (CMPM 118). It builds an
MCP server that lets an LLM assemble a monster sprite (body/arms/legs/eyes/mouth/
antennas) in a live Phaser browser game, using art from Kenney's Monster Builder
Pack (`assets/`). Only `create_body` and `clear_monster` are implemented — most
of the tool surface is `TODO` and must be built out following the existing
pattern.

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

## Known incomplete pieces (per existing TODO comments)

- `parts.js`: `leg`, `eye`, `mouth`, `antenna` entries are missing `colors`/
  `shapes` arrays (only `body` and `arm` have them filled in).
- `scene.js` `preload()`: only loads `body_*` textures; arms/legs/eyes/mouths/
  antennas are not preloaded yet — must be added following the same
  nested-loop pattern before those parts can be rendered.
- `scene.js` `executeCommand()`: only `clear_monster` and `create_body` are
  implemented. Stubbed cases in comments: `add_arms`, `add_legs`, `add_eyes`,
  `add_mouth`, `add_antennas`, `get_monster_state`, `build_monster`.
- `index.js`: only the `create_body` tool is registered; comment marks where
  more tools go.

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

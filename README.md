# Drawlight

**Draw diagrams at the speed of thought.** A tiny, keyboard-friendly diagram editor for engineers.

Nuxt 4 UI • Gleam API • optional Rust/Wasm geometry • Mermaid export • local MCP server.

## Quick start

```sh
npm install
npm run dev
```

Open http://localhost:3000. **The editor works immediately without any backend or account** and automatically saves to your browser's local storage.

### Built-in engineering templates

Click **Templates**, then choose a card: two clicks total. Available presets:

- Blank canvas
- API request flow (success/error branches)
- Web app architecture (Nuxt, API, services, queue, database)
- CI/CD pipeline (build, tests, deployment)
- ER · SaaS schema (typed attributes, PK/FK, 1:1 / 1:N / N:M cardinalities)
- ER · Blog database (users, posts and comments)
- Sequence · API authentication (participants, ordered requests and replies)
- Sequence · Event processing (asynchronous messages)
- Event-driven services (producer, event bus, consumers)

Switching templates is fully undoable with **Ctrl/Cmd+Z**. Press **T** to open the gallery from the keyboard. Templates share the same editable JSON and Mermaid export as manually created diagrams.

### Editing in at most two clicks

| Action | Interaction |
| --- | --- |
| Create a shape | Click a shape in the left toolbar, then click the canvas |
| Load a template | Click Templates, then click a preset |
| Connect two shapes | Click the small **+** port on the source, then click the target |
| Move a shape | Drag directly (one gesture) |
| Rename | Double-click a shape (or select it and use the inspector) |
| Pan | Drag empty canvas; hold Space to pan |
| Zoom | Mouse wheel or the bottom-right controls |
| Delete | Select and press Delete/Backspace |
| Undo/redo | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z |
| Export | Mermaid, JSON, SVG; import JSON from the top bar |

**Shortcut keys:** T = templates, V = select, R = process, D = decision, B = database, S = start, N = note, Escape = cancel.

### Optional Gleam persistence and AI editing

Install [Gleam](https://gleam.run/getting-started/installing/) and Erlang, then in another terminal:

```sh
cd backend
gleam run
```

Start Nuxt with remote sync:

```sh
NUXT_PUBLIC_SYNC_ENABLED=true npm run dev
```

The Gleam server binds to **127.0.0.1:8000** for local-only PoC use. The Nuxt server proxies requests to it. It stores a single shared diagram in `backend/drawlight.json`. **Not ready for public multi-user hosting**: add authentication, permissions, durable database writes, and concurrency/version checks before exposing write APIs.

For MCP use the same local Gleam server:

```sh
cd mcp && npm install
node server.mjs
```

Configure your MCP client to launch `node /absolute/path/to/drawlight/mcp/server.mjs` with stdio. Tools include reading a diagram, adding/moving nodes, connecting nodes, and Mermaid export. With sync enabled, remote edits appear in the editor on its next refresh cycle.

### Rust/Wasm geometry (optional)

```sh
cargo install wasm-pack
npm run build:wasm
```

The generated browser module is placed in `public/geometry/` (git-ignored). The client automatically loads it when available; otherwise a matching TypeScript fallback is used. The SVG renderer avoids requiring WebGL for small diagrams.

### Verification

```sh
npm run test
npm run typecheck
npm run test:e2e
npm run build
cd backend && gleam check
cargo test --manifest-path geometry/Cargo.toml
```

CI includes Nuxt typechecking, browser interaction tests, a live Gleam API smoke test, and Rust/Wasm verification. A GitHub Pages deployment workflow is included; enable GitHub Pages → **GitHub Actions** in repository Settings to publish the static client. The static site runs in local-only mode.

## Scope

This is an **interactive PoC**, not yet a Figma alternative: mode-aware flowchart, ER and sequence diagram editing, orthogonal connectors, snapping, pan/zoom, undo/redo, import/export, autosave, optional Gleam persistence, MCP editing. No authentication, concurrent multi-user reconciliation, advanced UML/ER notation (weak entities, nested sequence fragments), or production-grade scalability yet.

Source of truth is Drawlight JSON **v2**. Legacy v1 flowchart JSON is migrated on import/load. Drawlight JSON uses a common node/edge model plus a `kind` discriminator:
- `flowchart`: basic shape nodes and connections
- `er`: `entity` nodes with typed `fields`, PK/FK and edge `cardinality`
- `sequence`: `participant` nodes with ordered message edges and `messageType`

The schema is validated by the same pure JS module in the browser and MCP server. Mermaid exporters select the diagram type. Mermaid exports semantic relationships, but **does not preserve exact canvas coordinates**.

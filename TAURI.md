# GridIron IQ — Desktop build (Tauri)

The app already runs as a pure browser app. This doc is the recipe to *also*
ship it as an installed desktop app, where seasons are stored as **real files**
(no browser sandbox, no localStorage eviction, automatic backups).

The hard part is already done: storage goes through a backend seam
(`js/storage-backend.js`). `detectBackend()` returns `TauriBackend` when it sees
`window.__TAURI__`, so the same UI uses native files on the desktop and the
browser backend on the web — no UI changes.

> Status: the JS side (the `TauriBackend`) ships in the bundle and is dormant in
> the browser. The Rust shell below has **not** been compiled in this repo's CI
> (it needs the Rust toolchain). Run the steps on a dev machine to produce
> installers.

## Prerequisites

- Rust (`https://rustup.rs`)
- Node 18+
- Tauri CLI: `cargo install tauri-cli` (or `npm i -D @tauri-apps/cli`)
- Tauri v2 JS API in the page: `@tauri-apps/api` (the `TauriBackend` expects
  `window.__TAURI__.fs` / `window.__TAURI__.path`; enable
  `app.withGlobalTauri = true` in `tauri.conf.json` so they're on `window`).

## Layout

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── build.rs
└── src/main.rs
```

The Tauri `frontendDist` should point at the built single file
`football-film-analyzer.html` (run `./build.sh` first), or at a folder
containing it renamed to `index.html`.

## tauri.conf.json (sketch)

```json
{
  "productName": "GridIron IQ",
  "version": "1.0.0",
  "identifier": "com.gridironiq.app",
  "build": { "frontendDist": "../dist" },
  "app": {
    "withGlobalTauri": true,
    "windows": [{ "title": "GridIron IQ", "width": 1400, "height": 900 }]
  },
  "plugins": {
    "fs": {
      "requireLiteralLeadingDot": false,
      "scope": ["$APPDATA/**", "$DOCUMENT/**"]
    }
  },
  "bundle": { "active": true, "targets": "all" }
}
```

`TauriBackend` reads/writes `season.json` and `backups/season_<ts>.json` under
`BaseDirectory.AppData` by default — covered by the `$APPDATA/**` scope above.
To let the coach choose a folder (e.g. a Dropbox/Drive-synced one) use the Tauri
dialog plugin and store the chosen path; the backend can be extended to write
there instead of AppData.

## Build

```bash
./build.sh                 # produce football-film-analyzer.html
mkdir -p dist && cp football-film-analyzer.html dist/index.html
cargo tauri build          # -> native installers in src-tauri/target/release/bundle
```

## Why this is the robust answer

- **No browser wipe.** Seasons are normal files; clearing a browser can't touch
  them.
- **True backups + undo.** The backup ring (`backups/`) is real timestamped
  files; Restore rolls back to any of them, and restoring snapshots the current
  state first (reversible).
- **Offsite for free.** Point the storage folder at a cloud-synced folder
  (Dropbox / Google Drive / OneDrive / iCloud) → survives the machine dying and
  the file can be shared with other coaches, who open it in the zero-install web
  build to review.
- **Same UI everywhere.** Only the storage backend differs.

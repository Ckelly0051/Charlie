# GridIron IQ — Desktop build (Tauri v2)

The app already runs as a pure browser app. This doc is the recipe to *also*
ship it as an installed desktop app, where seasons are stored as **real files**
(no browser sandbox, no localStorage eviction, automatic backups).

The hard part is already done: storage goes through a backend seam
(`js/storage-backend.js`). `detectBackend()` returns `TauriBackend` when it sees
`window.__TAURI__`, so the same UI uses native files on the desktop and the
browser backend on the web — no UI changes.

> Status: the Rust shell compiles and produces installers. The `TauriBackend`
> uses Tauri v2 APIs (`withGlobalTauri: true`) — `mkdir`, `remove`, `readDir`
> with `{ baseDir }` options.

## Prerequisites

- Rust (`https://rustup.rs`)
- Node 18+
- Tauri CLI v2: `cargo install tauri-cli --version "^2"`
- System deps (Ubuntu/Debian):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
    librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev patchelf
  ```

## Layout

```
src-tauri/
├── Cargo.toml            # Rust crate: tauri + plugins (fs, dialog, shell)
├── tauri.conf.json        # App config: window, CSP, bundle settings
├── build.rs               # Tauri build script
├── capabilities/
│   └── default.json       # v2 permissions: fs scope, dialog, shell
├── icons/                 # App icons (placeholder — replace for production)
│   ├── 32x32.png
│   ├── 128x128.png
│   ├── 128x128@2x.png
│   ├── icon.icns
│   └── icon.ico
└── src/
    └── main.rs            # Entry point: registers plugins, launches app
```

The Tauri `frontendDist` points at `../dist`, which contains the built
single-file app renamed to `index.html`.

## Build

```bash
./build.sh                 # produce football-film-analyzer.html
mkdir -p dist && cp football-film-analyzer.html dist/index.html
cargo tauri build           # -> native installers in src-tauri/target/release/bundle
```

For debug builds (faster, includes devtools):
```bash
cargo tauri build --debug   # -> src-tauri/target/debug/bundle
```

## Tauri v2 API notes

With `withGlobalTauri: true` in `tauri.conf.json`, plugin APIs are on
`window.__TAURI__`:
- `window.__TAURI__.fs` — `exists()`, `readTextFile()`, `writeTextFile()`,
  `mkdir()`, `readDir()`, `remove()`
- Options use `{ baseDir: fs.BaseDirectory.AppData }` (not `dir`)
- `readDir()` returns `{ name, isFile, isDirectory }` entries
- Permissions are granted via `src-tauri/capabilities/default.json`

`TauriBackend` reads/writes `season.json` and `backups/season_<ts>.json` under
`BaseDirectory.AppData` — covered by the `$APPDATA/**` scope.

## Capabilities (permissions)

Tauri v2 requires explicit permission grants in `capabilities/default.json`:
- `fs:allow-exists`, `fs:allow-read-text-file`, `fs:allow-write-text-file`,
  `fs:allow-mkdir`, `fs:allow-read-dir`, `fs:allow-remove`
- `fs:scope` with `$APPDATA/**`, `$DOCUMENT/**`, `$HOME/**`
- `dialog:allow-open`, `dialog:allow-save`
- `shell:allow-open`

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

## Auto-update (tauri-plugin-updater)

The desktop app updates itself — no re-downloading installers per change.

**How it works:** on launch (`js/updater.js`, no-op on web) the app fetches
`latest.json` from the GitHub Releases endpoint configured in
`tauri.conf.json` → `plugins.updater.endpoints`. If a newer signed build
exists it shows an "Update & Restart" banner that downloads, verifies the
signature against `plugins.updater.pubkey`, installs, and relaunches.

**Wiring (already in the repo):**
- Rust: `tauri-plugin-updater` + `tauri-plugin-process` in `Cargo.toml`,
  registered in `main.rs`.
- Permissions: `updater:default`, `process:default` in
  `capabilities/default.json`.
- Bundle: `"createUpdaterArtifacts": true` so the build emits the signed
  update package (`.nsis.zip` / `.app.tar.gz`) + `.sig`.
- Frontend: `js/updater.js` (in `build.sh` list + imported by `app.js`).

**Signing keys:** Tauri signs every update with its own key (separate from
OS code-signing). The keypair was generated with `cargo tauri signer
generate`. The **public** key is committed in `tauri.conf.json`. The
**private** key + password must be added as repo secrets so CI can sign:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
(Settings → Secrets and variables → Actions). Lose the private key and you
can't ship updates the installed apps will accept — back it up.

**Publishing an update:** bump `version` in `tauri.conf.json` + `Cargo.toml`,
commit, then push a tag (`git tag v1.1.0 && git push origin v1.1.0`). The
CI workflow builds every platform, signs, generates `latest.json`, and
attaches everything to a GitHub Release. Installed apps pick it up on next
launch.

> Note: the matrix jobs each append their platform's signature to the
> release's `latest.json`. If a multi-platform release ever lands with a
> missing platform entry (rare race), re-run that platform's job.

## Production checklist

- [x] Replace placeholder icons with GridIron IQ branding (royal blue)
- [x] CI builds installers on macOS / Windows / Linux runners
- [x] Set up auto-update (Tauri updater plugin)
- [ ] Add `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
      repo secrets (one-time, required for signed updates)
- [ ] Code-sign for macOS notarization + Windows SmartScreen

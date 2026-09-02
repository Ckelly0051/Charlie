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

- Rust — stable toolchain (CI uses `dtolnay/rust-toolchain@stable`)
- Node 22 (both CI workflows pin `node-version: '22'`)
- Tauri CLI v2: `cargo install tauri-cli --version "^2"`
- System deps (Ubuntu/Debian):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
    librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev patchelf
  ```

## Layout

```
src-tauri/
├── Cargo.toml            # tauri (devtools, protocol-asset) + plugins:
│                         #   fs, dialog, updater, process, opener
├── tauri.conf.json        # App config: window, CSP, bundle settings
├── build.rs               # Tauri build script
├── capabilities/
│   └── default.json       # v2 permissions: fs scope, dialog, updater,
│                          #   process, opener
├── icons/                 # App icons (placeholder — replace for production)
│   ├── 32x32.png
│   ├── 128x128.png
│   ├── 128x128@2x.png
│   ├── icon.icns
│   └── icon.ico
└── src/
    └── main.rs            # Entry point: registers plugins, launches app
```

The Tauri `frontendDist` points at `../dist`, which is the plain Vite build
output (`dist/index.html` + hashed `dist/assets/*.js`/`*.css`/media) —
`src-tauri/tauri.conf.json`'s `beforeBuildCommand` (`"npm run build"`) runs
Vite automatically as part of `cargo tauri build`, so no separate copy step
is needed. The retired single-file concatenated bundle (`build.sh` →
`football-film-analyzer.html`) is deleted. There is no second build path and
no separate copy step.

## Build

```bash
npm ci                      # install frontend dependencies
cargo tauri build            # runs `npm run build` (Vite) automatically, then
                              # -> native installers in src-tauri/target/release/bundle
```

`npm run build` alone (no Rust) is enough to produce `dist/` for local
browser testing; `cargo tauri build` always rebuilds it fresh via
`beforeBuildCommand`, so a stale `dist/` from an earlier session can't leak
into a desktop build. This is the exact recipe `.github/workflows/
build-desktop.yml` uses (via `npm ci` + an explicit `npm run build` step,
then `tauri-apps/tauri-action`).

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
- `core:default`, `core:window:default`, `core:window:allow-set-title`,
  `core:window:allow-close`, `core:path:default`
- `fs:allow-exists`, `fs:allow-read-text-file`, `fs:allow-write-text-file`,
  `fs:allow-read-file`, `fs:allow-write-file`, `fs:allow-mkdir`,
  `fs:allow-read-dir`, `fs:allow-remove`
- `fs:scope` with `$APPDATA/**`, `$RESOURCE/**`, `$DOCUMENT/**`,
  `$DOWNLOAD/**`, `$DESKTOP/**`
- `dialog:allow-open`, `dialog:allow-save`
- `updater:default`, `process:default`
- `opener:default`, plus `opener:allow-open-path` and
  `opener:allow-reveal-item-in-dir` scoped to `$APPDATA` and `$DOCUMENT`

A coach-chosen linked-film folder is granted at runtime by the `allow_library_dir`
command in `src/main.rs`, which extends the asset-protocol and fs scopes to that
directory only. An imported season cannot widen scope on its own: a `filmDir`
outside the granted library root is refused and prompts a re-link.

## Asset protocol and CSP — do not "clean this up"

Film is served to the WebView through Tauri's asset protocol
(`assetProtocol.enable`, scoped to `$APPDATA/**` plus any coach-granted library
directory). `convertFileSrc()` produces the URL.

**On Windows/WebView2 that URL scheme is `http://asset.localhost`, not
`https://`.** macOS produces `asset://localhost`. The CSP in `tauri.conf.json`
therefore lists **all** of `asset:`, `http://asset.localhost`, and
`https://asset.localhost` in `media-src` / `img-src`, and
`http://asset.localhost` in `connect-src` for diagnostic probes.

Dropping the `http://` origin looks harmless and silently blocks **every** video
load with "Media load rejected by URL safety check" — not a CORS error, not a
codec error, a CSP violation. That cost multiple releases to diagnose. Both
origins stay.

`connect-src` also allows `http://127.0.0.1:*` and `http://localhost:*` for the
optional local CV server, and `script-src` allows `wasm-unsafe-eval` so sql.js
can load the SQLite catalog.

## Film storage: desktop and browser are NOT equivalent

- **Desktop** has a persistent film library. Managed film is copied under
  `$APPDATA/seasons/<season>/films/<game>/` and auto-loads on game open; linked
  film is referenced in place in the coach's own folder and never copied.
- **Browser** has **no** persistent film library. Each game records its
  `videoFileName` and the coach re-links film every session. This is a real
  capability difference, not a configuration detail — do not document them as
  interchangeable.

Season JSON and backups mirror to `Documents/GridIron IQ/`; **film is not
mirrored** (too large, and linked originals are re-linkable).

## Required installed smoke

Puppeteer cannot certify this build. Codecs, the asset protocol, native
dialogs, filesystem scope, and app lifecycle are only real in installed
WebView2. Before accepting any desktop release, on the installed app:

1. Open a season with **linked** film on its real drive and confirm playback,
   with no managed-copy fallback.
2. Open a season with **managed** film and confirm it auto-loads after a
   restart.
3. Chart a play, close the app, reopen, and confirm both data and film.
4. Switch seasons and confirm counts, tags, and film identity survive.

## Why this is the robust answer

- **No browser wipe.** Seasons are normal files; clearing a browser can't touch
  them.
- **True backups + undo.** The backup ring (`backups/`) is real timestamped
  files; Restore rolls back to any of them, and restoring snapshots the current
  state first (reversible).
- **A copy outside app data.** Season JSON and backups also mirror to
  `Documents/GridIron IQ/`, so clearing application data on uninstall does not
  take the seasons with it, and the mirror is what post-wipe recovery reads.
  Season files can be shared with other coaches, who open them in the
  zero-install web build to review.
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
- Frontend: `js/updater.js`, imported by `app.js` as an ordinary ES module
  (part of the Vite entry graph — no separate bundle-file list to keep in
  sync with it).

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
- [x] Add `TAURI_SIGNING_PRIVATE_KEY` repo secret (confirmed working — first
      signed release v1.0.3 published & signed on all platforms). The
      `_PASSWORD` secret is intentionally omitted (empty passphrase); the
      workflow references it and resolves to "" when absent.
- [ ] Code-sign for macOS notarization + Windows SmartScreen

**Unsigned local packages.** `cargo tauri build --no-sign` (or a local config
that disables updater-artifact signing) produces working installers without the
private key, which is how local smoke candidates are built. Those artifacts are
**not** updater-publishable: installed apps only accept updates signed with the
committed `pubkey`. Windows also shows a SmartScreen "unknown publisher" prompt
for unsigned installers, which the coach must click through with
**More info → Run anyway** until OS code-signing is in place.

### First signed release — verified (v1.0.3)

The first end-to-end signed release shipped as **v1.0.3**
(`https://github.com/Ckelly0051/Charlie/releases/tag/v1.0.3`): Windows
`.exe`/`.msi`, macOS `.dmg`/`.app.tar.gz`, Linux `.deb`/`.AppImage`/`.rpm`,
each with a `.sig`, plus `latest.json` at the updater endpoint.

Two CI fixes were needed to get there, both now baked in:
1. **Signing key newlines** — a pasted GitHub secret carried a trailing
   newline the Tauri signer rejected ("Invalid symbol 10"). The "Normalize
   signing key" step strips CR/LF before the build.
2. **Release permissions** — the workflow token defaulted to read-only, so
   Release creation failed ("Resource not accessible by integration"). Fixed
   with `permissions: contents: write` in the workflow **and** the repo
   setting (Settings → Actions → General → Workflow permissions → Read and
   write). Note: a tag-triggered run uses the workflow file *as of the tagged
   commit*, so the permissions fix had to be in the tag (v1.0.2 had it only on
   the branch and still failed; v1.0.3 included it and succeeded).

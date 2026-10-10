# Installer 114 Package Inspection

Codex, 2026-10-10. Result: **PASS**, no package findings.

## Identity

- Source: clean version-bump commit `f310fbf1`.
- Installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-114_x64-setup.exe`.
- Size: 4,052,190 bytes.
- SHA-256: `1e52536e96fcb8d7b517c8ef4846f620c89baee14e93ae0645a6c10a9367cf6d`.
- Installer and extracted app executable product/file versions: `1.12.0-114`.
- Extracted app executable SHA-256:
  `8c1b5c443dacf90f94229611ecd64f79d4eb71eb729e8a440347c698549c02f3`.

## Independent Checks

Decoded the NSIS LZMA stream without running the installer: 13 records,
including the executable and both SQLite resources. Located seven compressed
frontend blobs inside that extracted executable and decompressed them.

Exported `f310fbf1` with `git archive` and built its frontend in an isolated
scratch directory using the existing dependency installation. No working-tree
`dist/` was used as the comparison authority.

| Check | Result |
|---|---|
| JavaScript, `assets/index-ByJJpoKI.js` | Exact byte match; SHA-256 `2c92f7f2e21cbb542cc8ac22b1563bf707f84be03025e6f90f03f72ee8fa0df2` |
| CSS, `assets/index-Dmk7E48G.css` | Exact byte match; SHA-256 `683e4b29e4645afc48d4531914ca3a800e97c6f80444051b6c004bb0d07233fc` |
| Favicon, touch icon and icon sprite | Exact byte matches |
| Standalone icon SVG | Equal after CRLF/LF normalization |
| HTML | Same DOM structure, text and attributes after serialization/whitespace normalization |
| HTML asset references | All resolve to matching packaged assets |
| SQLite WASM | Exact byte match; SHA-256 `438c88f666dc054ce4e9395f80fe9db4218b1a3c379960454880f048a7898aed` |
| SQLite JavaScript | Equal after CRLF/LF normalization |

The extracted native executable also matches the existing release executable
except for the three-byte bundle marker: `__TAURI_BUNDLE_TYPE_VAR_UNK` becomes
`__TAURI_BUNDLE_TYPE_VAR_NSS`. Tauri's local `platform.rs` defines `NSS` as NSIS;
this is expected packaging metadata, not an app-code difference. The native
executable was not independently recompiled in this inspection.

## Evidence and Boundaries

Local evidence is under
`C:\Users\charl\OneDrive\Documents\ChatGPT\Football App\tmp\installer-114-review\`:
`extraction.json`, `comparison.json`, the extracted executable/resources,
decoded frontend assets and isolated source build. Inspection scripts are in
that workspace's `tools/inspect-installer114.py` and
`tools/compare-installer114.mjs`.

No installer or app was launched, no coach data was accessed or changed,
and no full gate was run. A temporary headless browser parsed only the two
HTML strings to compare their DOM structures.

This passes the packaged-asset check only. Installed smoke remains the coach's
decision. The recorded full gate remains **157/158 at `075522ce`**, with the
coach-accepted focused reruns described in `SMOKE-1.12.0-114.md`; this review
does not turn that into a green full gate on the final packaged bytes.

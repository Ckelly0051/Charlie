import fs from 'node:fs';
const from = '1.12.0-21', to = '1.12.0-22';
for (const [path, a, b] of [
  ['js/app.js', `const APP_VERSION = '${from}'`, `const APP_VERSION = '${to}'`],
  ['src-tauri/Cargo.toml', `version = "${from}"`, `version = "${to}"`],
  ['src-tauri/tauri.conf.json', `"version": "${from}"`, `"version": "${to}"`],
]) { const s = fs.readFileSync(path, 'utf8'); if (!s.includes(a)) { console.log('MISS', path); continue; } fs.writeFileSync(path, s.split(a).join(b), 'utf8'); }
const lp = 'src-tauri/Cargo.lock', l = fs.readFileSync(lp, 'utf8'), i = l.indexOf('name = "gridiron-iq"');
fs.writeFileSync(lp, l.slice(0, i) + l.slice(i).replace(`version = "${from}"`, `version = "${to}"`), 'utf8');
console.log('stamped', to);

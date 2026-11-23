// Copies the SQLite engine used by the web version into public/, which
// Expo serves (and exports) as-is. Run before `expo start --web` or a web export.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm-browser.wasm');
const destDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'sql-wasm-browser.wasm'));
console.log('Copied sql-wasm-browser.wasm to public/');

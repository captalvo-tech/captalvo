const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.resolve(__dirname, '../public/index.html');
let html = fs.readFileSync(indexHtmlPath, 'utf8');

const files = [
    'captalvo.css',
    'captalvo-cache.js',
    'captalvo-asset-manager.js',
    'captalvo-diagnostics.js',
    'captalvo-asset-bridge.js',
    'captalvo-home-sim.js',
    'captalvo-app.js'
];

const ts = Math.floor(Date.now() / 1000);
for (const f of files) {
    const escaped = f.replace(/\./g, '\\.');
    const reg = new RegExp(`(src|href)="${escaped}(\\?[^"]*)?"`, 'g');
    html = html.replace(reg, `$1="${f}?t=${ts}"`);
}

fs.writeFileSync(indexHtmlPath, html, 'utf8');
console.log(`Updated index.html with timestamp t=${ts} for all ${files.length} assets.`);

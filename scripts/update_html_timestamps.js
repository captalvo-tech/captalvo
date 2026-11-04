const fs = require('fs');
const path = require('path');

const ts = Math.floor(Date.now() / 1000);

// 0. Update Root index.html
const rootHtmlPath = path.resolve(__dirname, '../public/index.html');
if (fs.existsSync(rootHtmlPath)) {
    let html = fs.readFileSync(rootHtmlPath, 'utf8');
    const files = [
        'captalvo.css',
        'captalvo-cache.js',
        'captalvo-asset-manager.js',
        'captalvo-diagnostics.js',
        'captalvo-asset-bridge.js',
        'captalvo-home-sim.js',
        'captalvo-app.js'
    ];
    for (const f of files) {
        const escaped = f.replace(/\./g, '\\.');
        const reg = new RegExp(`(src|href)="${escaped}(\\?[^"]*)?"`, 'g');
        html = html.replace(reg, `$1="${f}?t=${ts}"`);
    }
    fs.writeFileSync(rootHtmlPath, html, 'utf8');
    console.log(`Updated public/index.html with timestamp t=${ts} for all ${files.length} assets.`);
}

// 1. Update WebGL2 index.html
const webgl2HtmlPath = path.resolve(__dirname, '../public/webgl2/index.html');
if (fs.existsSync(webgl2HtmlPath)) {
    let html = fs.readFileSync(webgl2HtmlPath, 'utf8');
    const files = [
        'captalvo.css',
        'captalvo-cache.js',
        'captalvo-asset-manager.js',
        'captalvo-diagnostics.js',
        'captalvo-asset-bridge.js',
        'captalvo-home-sim.js',
        'captalvo-app.js'
    ];
    for (const f of files) {
        const escaped = f.replace(/\./g, '\\.');
        const reg = new RegExp(`(src|href)="${escaped}(\\?[^"]*)?"`, 'g');
        html = html.replace(reg, `$1="${f}?t=${ts}"`);
    }
    fs.writeFileSync(webgl2HtmlPath, html, 'utf8');
    console.log(`Updated public/webgl2/index.html with timestamp t=${ts} for all ${files.length} assets.`);
}

// 2. Update WebGPU index.html
const webgpuHtmlPath = path.resolve(__dirname, '../public/webgpu/index.html');
if (fs.existsSync(webgpuHtmlPath)) {
    let html = fs.readFileSync(webgpuHtmlPath, 'utf8');
    html = html.replace(/(src|href)="(\/webgpu\/assets\/[^"?]+)(\?[^"]*)?"/g, `$1="$2?t=${ts}"`);
    fs.writeFileSync(webgpuHtmlPath, html, 'utf8');
    console.log(`Updated public/webgpu/index.html with timestamp t=${ts}.`);
}

// 3. Update Scorpion index.html
const scorpionHtmlPath = path.resolve(__dirname, '../public/scorpion/index.html');
if (fs.existsSync(scorpionHtmlPath)) {
    let html = fs.readFileSync(scorpionHtmlPath, 'utf8');
    html = html.replace(/(src|href)="(\/scorpion\/assets\/[^"?]+)(\?[^"]*)?"/g, `$1="$2?t=${ts}"`);
    fs.writeFileSync(scorpionHtmlPath, html, 'utf8');
    console.log(`Updated public/scorpion/index.html with timestamp t=${ts}.`);
}

// 4. Update Big Armada index.html
const bigArmadaHtmlPath = path.resolve(__dirname, '../public/big-armada/index.html');
if (fs.existsSync(bigArmadaHtmlPath)) {
    let html = fs.readFileSync(bigArmadaHtmlPath, 'utf8');
    const baFiles = [
        'css/big-armada.css',
        'js/s2_client.js',
        'js/terrain_engine.js',
        'js/rts_renderer.js',
        'js/big-armada-client.js'
    ];
    for (const f of baFiles) {
        const escaped = f.replace(/\./g, '\\.').replace(/\//g, '\\/');
        const reg = new RegExp(`(src|href)="${escaped}(\\?[^"]*)?"`, 'g');
        html = html.replace(reg, `$1="${f}?t=${ts}"`);
    }
    fs.writeFileSync(bigArmadaHtmlPath, html, 'utf8');
    console.log(`Updated public/big-armada/index.html with timestamp t=${ts}.`);
}

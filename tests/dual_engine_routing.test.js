// ==============================================================================
// CAPTALVO TEST SUITE — DUAL ENGINE ROUTING & ISOLATION
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n--- Running Dual Engine Routing & Isolation Tests ---');

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

// 1. Root Launcher Verification
const rootHtmlPath = path.join(publicDir, 'index.html');
assert(fs.existsSync(rootHtmlPath), 'Root index.html must exist as the Dual Engine Launcher');
const rootHtml = fs.readFileSync(rootHtmlPath, 'utf8');
assert(rootHtml.includes('/webgl2/'), 'Launcher must link to /webgl2/');
assert(rootHtml.includes('/webgpu/'), 'Launcher must link to /webgpu/');
assert(rootHtml.includes('navigator.gpu'), 'Launcher must probe navigator.gpu for WebGPU compatibility');
assert(rootHtml.includes('WebGL 2.0 (SAGE)'), 'Launcher must present WebGL 2.0 engine');
assert(rootHtml.includes('WebGPU (Origami)'), 'Launcher must present WebGPU engine');
console.log('✓ Root Launcher (public/index.html) dual engine cards and hardware probe verified.');

// 2. WebGL 2.0 Engine Isolation & Return Link
const webgl2HtmlPath = path.join(publicDir, 'webgl2/index.html');
assert(fs.existsSync(webgl2HtmlPath), 'public/webgl2/index.html must exist');
const webgl2Html = fs.readFileSync(webgl2HtmlPath, 'utf8');
assert(webgl2Html.includes('href="/"'), 'WebGL 2.0 must have link back to root launcher ("/")');
assert(fs.existsSync(path.join(publicDir, 'webgl2/GeneralsZH.js')), 'public/webgl2/GeneralsZH.js must exist');
assert(fs.existsSync(path.join(publicDir, 'webgl2/GeneralsZH.wasm')), 'public/webgl2/GeneralsZH.wasm must exist');
assert(fs.existsSync(path.join(publicDir, 'webgl2/captalvo-app.js')), 'public/webgl2/captalvo-app.js must exist');
console.log('✓ WebGL 2.0 engine self-contained assets and launcher return navigation verified.');

// 3. WebGPU (Origami) Distribution & Integrity
const webgpuHtmlPath = path.join(publicDir, 'webgpu/index.html');
assert(fs.existsSync(webgpuHtmlPath), 'public/webgpu/index.html must exist');
const webgpuHtml = fs.readFileSync(webgpuHtmlPath, 'utf8');
assert(webgpuHtml.includes('href="/"'), 'WebGPU must have link back to root launcher ("/")');
assert(!webgpuHtml.includes('G-7PS7XPQE5G'), 'Google Analytics must be removed from WebGPU for user privacy');
assert(fs.existsSync(path.join(publicDir, 'webgpu/GeneralsXZH.js')), 'public/webgpu/GeneralsXZH.js must exist');
assert(fs.existsSync(path.join(publicDir, 'webgpu/GeneralsXZH.wasm')), 'public/webgpu/GeneralsXZH.wasm must exist');
assert(fs.existsSync(path.join(publicDir, 'webgpu/GeneralsXZH.data')), 'public/webgpu/GeneralsXZH.data must exist');
assert(fs.existsSync(path.join(publicDir, 'webgpu/assets/index-BcW0hOmG.js')), 'public/webgpu/assets/index-BcW0hOmG.js must exist');
assert(fs.existsSync(path.join(publicDir, 'webgpu/assets/index-DaJE1AVD.css')), 'public/webgpu/assets/index-DaJE1AVD.css must exist');

const webgpuBundle = fs.readFileSync(path.join(publicDir, 'webgpu/assets/index-BcW0hOmG.js'), 'utf8');
assert(webgpuBundle.includes('/webgpu/GeneralsXZH.wasm'), 'Bundle must reference /webgpu/GeneralsXZH.wasm');
assert(webgpuBundle.includes('/webgpu/GeneralsXZH.data'), 'Bundle must reference /webgpu/GeneralsXZH.data');
assert(webgpuBundle.includes('/webgpu/GeneralsXZH.js'), 'Bundle must reference /webgpu/GeneralsXZH.js');
console.log('✓ WebGPU (Origami) distribution, privacy compliance and scoped path routing verified.');

// 4. Server MIME Types & Apache Configuration
const htaccessPath = path.join(publicDir, '.htaccess');
assert(fs.existsSync(htaccessPath), 'public/.htaccess must exist');
const htaccess = fs.readFileSync(htaccessPath, 'utf8');
assert(htaccess.includes('AddType application/wasm .wasm'), '.htaccess must configure .wasm MIME');
assert(htaccess.includes('AddType application/octet-stream .data'), '.htaccess must configure .data MIME');
assert(htaccess.includes('AddType application/octet-stream .big'), '.htaccess must configure .big MIME');
assert(htaccess.includes('GeneralsXAssets'), '.htaccess must route GeneralsXAssets');
assert(htaccess.includes('GeneralsXLog'), '.htaccess must route GeneralsXLog');
assert(htaccess.includes('GeneralsXShare'), '.htaccess must route GeneralsXShare');
console.log('✓ Apache configuration (.htaccess) MIME types and Origami routing verified.');

// 5. Backend Origami Helper Endpoints
const apiIndexPath = path.join(publicDir, 'api/index.php');
assert(fs.existsSync(apiIndexPath), 'public/api/index.php must exist');
const apiIndex = fs.readFileSync(apiIndexPath, 'utf8');
assert(apiIndex.includes('GeneralsXAssets'), 'API must handle GeneralsXAssets');
assert(apiIndex.includes('GeneralsXLog'), 'API must handle GeneralsXLog');
assert(apiIndex.includes('GeneralsXShare'), 'API must handle GeneralsXShare');
console.log('✓ Backend API (public/api/index.php) Origami helper endpoints verified.');

console.log('✅ ALL DUAL ENGINE ROUTING & ISOLATION TESTS PASSED!\n');


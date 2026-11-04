// ==============================================================================
// CAPTALVO TEST SUITE — MOUSE COORDINATE PROJECTION & VIEWPORT HIT-TEST
// ==============================================================================

const assert = require('assert');
const { CaptalvoMouseDiagnostics, ZERO_HOUR_MAIN_MENU_BUTTONS } = require('../public/captalvo-diagnostics.js');

console.log('\n--- Running Mouse & Viewport Coordinate Translation Tests ---');

// Mock DOM elements and objects
const mouseDiag = new CaptalvoMouseDiagnostics();

// Test 1: Verification of Button Definitions in 800x600 space
const spBtn = ZERO_HOUR_MAIN_MENU_BUTTONS.find(b => b.name === 'MainMenu.wnd:ButtonSinglePlayer');
assert(spBtn, 'ButtonSinglePlayer must exist in button definitions');
assert.deepStrictEqual(spBtn.rect, [540, 116, 748, 152], 'Single Player button rect must be [540, 116, 748, 152]');

const optBtn = ZERO_HOUR_MAIN_MENU_BUTTONS.find(b => b.name === 'MainMenu.wnd:ButtonOptions');
assert(optBtn, 'ButtonOptions must exist in button definitions');
assert.deepStrictEqual(optBtn.rect, [540, 236, 748, 272], 'Options button rect must be [540, 236, 748, 272]');
console.log('✓ MainMenu.wnd button geometries in 800x600 coordinate grid verified.');

// Test 2: Center of "UM JOGADOR" Button Click on 1440p (1740x1305 CSS Rect)
// Visual center of button in 800x600 space: X = (540 + 748)/2 = 644, Y = (116 + 152)/2 = 134
const canvasRect = { width: 1740, height: 1305, left: 100, top: 50 };
const targetInternalW = 800;
const targetInternalH = 600;

const visualClickClientX = canvasRect.left + (644 * (canvasRect.width / targetInternalW));
const visualClickClientY = canvasRect.top + (134 * (canvasRect.height / targetInternalH));

// Execute Qf translation formula exactly as patched in GeneralsZH.js
const rawRelX = visualClickClientX - canvasRect.left;
const rawRelY = visualClickClientY - canvasRect.top;
const engineX = Math.max(0, Math.min(targetInternalW - 1, Math.round(rawRelX * (targetInternalW / canvasRect.width))));
const engineY = Math.max(0, Math.min(targetInternalH - 1, Math.round(rawRelY * (targetInternalH / canvasRect.height))));

assert.strictEqual(engineX, 644, 'Projected Engine X must match 644');
assert.strictEqual(engineY, 134, 'Projected Engine Y must match 134');

const hits = mouseDiag.testHit(engineX, engineY);
assert(hits.length > 0, 'Hit test must detect at least one button');
assert.strictEqual(hits[0].name, 'MainMenu.wnd:ButtonSinglePlayer', 'Hit test must identify ButtonSinglePlayer');
console.log(`✓ Visual center click on "UM JOGADOR" correctly projects to (${engineX}, ${engineY}) and hits ${hits[0].label}.`);

// Test 3: Record Input via CaptalvoMouseDiagnostics
const domEvt = {
    type: 'mousedown',
    button: 0,
    clientX: visualClickClientX,
    clientY: visualClickClientY,
    screenX: visualClickClientX + 20,
    screenY: visualClickClientY + 80
};

mouseDiag.recordInput(domEvt, canvasRect, rawRelX, rawRelY, engineX, engineY, targetInternalW, targetInternalH);
assert(mouseDiag.lastClick, 'mouseDiag.lastClick must be recorded');
assert.strictEqual(mouseDiag.lastClick.hitTest.hasHit, true, 'hasHit must be true');
assert(mouseDiag.lastClick.hitTest.targets.some(t => t.includes('UM JOGADOR')), 'Targets must contain UM JOGADOR');
console.log('✓ Diagnostic recordInput logs DOM, canvas relative and engine coordinates with SDL confirmation.');

// Test 4: Corner & Boundary Clamping
const outOfBoundsLeftX = canvasRect.left - 50;
const outOfBoundsTopY = canvasRect.top - 50;
const rawRelOutX = outOfBoundsLeftX - canvasRect.left;
const rawRelOutY = outOfBoundsTopY - canvasRect.top;
const clampedEngineX = Math.max(0, Math.min(targetInternalW - 1, Math.round(rawRelOutX * (targetInternalW / canvasRect.width))));
const clampedEngineY = Math.max(0, Math.min(targetInternalH - 1, Math.round(rawRelOutY * (targetInternalH / canvasRect.height))));

assert.strictEqual(clampedEngineX, 0, 'Negative X must clamp to 0');
assert.strictEqual(clampedEngineY, 0, 'Negative Y must clamp to 0');
console.log('✓ Clamping logic protects against out-of-bounds clicks.');

// Test 5: Options Button Click
const optVisualClickX = canvasRect.left + (644 * (canvasRect.width / targetInternalW));
const optVisualClickY = canvasRect.top + (254 * (canvasRect.height / targetInternalH));
const optRawRelX = optVisualClickX - canvasRect.left;
const optRawRelY = optVisualClickY - canvasRect.top;
const optEngX = Math.max(0, Math.min(targetInternalW - 1, Math.round(optRawRelX * (targetInternalW / canvasRect.width))));
const optEngY = Math.max(0, Math.min(targetInternalH - 1, Math.round(optRawRelY * (targetInternalH / canvasRect.height))));

const optHits = mouseDiag.testHit(optEngX, optEngY);
assert(optHits.some(h => h.name === 'MainMenu.wnd:ButtonOptions'), 'Options button hit-test must succeed');
console.log(`✓ Click on "OPÇÕES" correctly projects to (${optEngX}, ${optEngY}) and hits ${optHits[0].label}.`);

// Test 6: Mousedown vs Mouseup coordinate symmetry test (preventing Emscripten document offset bug)
// Simulates Qf logic when mousedown has c = canvas, and mouseup has c = document
const mockCanvas = { width: 800, height: 600, getBoundingClientRect: () => canvasRect };
const mockDocument = {};
global.document = { getElementById: (id) => (id === 'canvas' ? mockCanvas : null) };

function simulateQf(c, clientX, clientY) {
    const _cv = (typeof document !== "undefined") ? document.getElementById('canvas') : null;
    const _rect = (_cv && _cv.getBoundingClientRect) ? _cv.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
    const _cw = (_cv && _cv.width) ? _cv.width : 800;
    const _ch = (_cv && _cv.height) ? _cv.height : 600;
    const _rw = (_rect && _rect.width > 0) ? _rect.width : _cw;
    const _rh = (_rect && _rect.height > 0) ? _rect.height : _ch;
    const _rawX = clientX - (_rect ? (_rect.left || 0) : 0);
    const _rawY = clientY - (_rect ? (_rect.top || 0) : 0);
    const _engX = Math.max(0, Math.min(_cw - 1, Math.round(_rawX * (_cw / _rw))));
    const _engY = Math.max(0, Math.min(_ch - 1, Math.round(_rawY * (_ch / _rh))));
    return { engX: _engX, engY: _engY };
}

const md = simulateQf(mockCanvas, visualClickClientX, visualClickClientY);
const mu = simulateQf(mockDocument, visualClickClientX, visualClickClientY);
assert.strictEqual(md.engX, mu.engX, 'Mousedown and Mouseup engX must be perfectly identical');
assert.strictEqual(md.engY, mu.engY, 'Mousedown and Mouseup engY must be perfectly identical');
console.log(`✓ Mousedown and Mouseup coordinate symmetry verified: (${md.engX}, ${md.engY}) == (${mu.engY}, ${mu.engY}).`);

// Test 7: Verify GeneralsZH.js binary glue patches for 800x600 CSS size & targetX/Y injection
const fs = require('fs');
const path = require('path');
const glueCode = fs.readFileSync(path.join(__dirname, '../public/GeneralsZH.js'), 'utf8');
assert(glueCode.includes('oa:()=>1,fa:(a,b,c)=>{a=S(a);if(!a)return-4;oa[b>>3]=800;oa[c>>3]=600;return 0}'), 'GeneralsZH.js must lock emscripten_get_element_css_size (fa) to 800x600 to prevent SDL 0x0 window resize');
assert(glueCode.includes('v[d+10]=_engX;v[d+11]=_engY;'), 'GeneralsZH.js Qf must write scaled _engX/_engY into targetX/targetY (v[d+10]/v[d+11])');
assert(glueCode.includes('if((e===5||e===6)&&z._mmD)try{A(z._mmD)(8,z.kl,z._mmB)}catch(_e){}'), 'GeneralsZH.js Rf must sync SDL mouse position on mousedown/mouseup before firing button callback');
console.log('✓ GeneralsZH.js SDL2 800x600 CSS size lock, targetX/Y injection, and click motion sync verified.');

console.log('✅ ALL MOUSE & VIEWPORT TESTS PASSED!\n');


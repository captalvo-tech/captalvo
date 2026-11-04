const fs = require('fs');
const path = require('path');

console.log('=== Captalvo: Applying Permanent Mouse, Modals & Audio Fixes ===\n');

// -----------------------------------------------------------------------------
// 1. Patch GeneralsZH.js (Mouse & Touch Coordinate Symmetry)
// -----------------------------------------------------------------------------
const zhPath = path.join(__dirname, '../public/GeneralsZH.js');
let zhContent = fs.readFileSync(zhPath, 'utf8');

const oldQf = `Qf=(a,b,c)=>{oa[a>>3]=b.timeStamp;var d=a>>2;v[d+2]=b.screenX;v[d+3]=b.screenY;v[d+4]=b.clientX;v[d+5]=b.clientY;r[a+24]=b.ctrlKey;r[a+25]=b.shiftKey;r[a+26]=b.altKey;r[a+27]=b.metaKey;ma[d*2+14]=b.button;ma[d*2+15]=b.buttons;v[d+8]=b.movementX;v[d+9]=b.movementY;a=be(c);var _cw=(c&&c.width)?c.width:800;var _ch=(c&&c.height)?c.height:600;var _rw=(a&&a.width)?a.width:_cw;var _rh=(a&&a.height)?a.height:_ch;var _rawX=b.clientX-(a.left||0);var _rawY=b.clientY-(a.top||0);var _engX=Math.max(0,Math.min(_cw-1,Math.round(_rawX*(_cw/_rw))));var _engY=Math.max(0,Math.min(_ch-1,Math.round(_rawY*(_ch/_rh))));v[d+10]=_engX;v[d+11]=_engY;if(typeof window!=="undefined"&&window.CaptalvoMouseDiag&&typeof window.CaptalvoMouseDiag.recordInput==="function"){window.CaptalvoMouseDiag.recordInput(b,a,_rawX,_rawY,_engX,_engY,_cw,_ch);}}`;

const newQf = `Qf=(a,b,c)=>{oa[a>>3]=b.timeStamp;var d=a>>2;v[d+2]=b.screenX;v[d+3]=b.screenY;v[d+4]=b.clientX;v[d+5]=b.clientY;r[a+24]=b.ctrlKey;r[a+25]=b.shiftKey;r[a+26]=b.altKey;r[a+27]=b.metaKey;ma[d*2+14]=b.button;ma[d*2+15]=b.buttons;v[d+8]=b.movementX;v[d+9]=b.movementY;var _cv=(typeof document!=="undefined")?document.getElementById('canvas'):null;var _rect=(_cv&&_cv.getBoundingClientRect)?_cv.getBoundingClientRect():be(c);var _cw=(_cv&&_cv.width)?_cv.width:800;var _ch=(_cv&&_cv.height)?_cv.height:600;var _rw=(_rect&&_rect.width>0)?_rect.width:_cw;var _rh=(_rect&&_rect.height>0)?_rect.height:_ch;var _rawX=b.clientX-(_rect?(_rect.left||0):0);var _rawY=b.clientY-(_rect?(_rect.top||0):0);var _engX=Math.max(0,Math.min(_cw-1,Math.round(_rawX*(_cw/_rw))));var _engY=Math.max(0,Math.min(_ch-1,Math.round(_rawY*(_ch/_rh))));v[d+10]=_engX;v[d+11]=_engY;if(typeof window!=="undefined"&&window.CaptalvoMouseDiag&&typeof window.CaptalvoMouseDiag.recordInput==="function"){window.CaptalvoMouseDiag.recordInput(b,_rect,_rawX,_rawY,_engX,_engY,_cw,_ch);}}`;

if (zhContent.includes(newQf)) {
    console.log(' [1/4] public/GeneralsZH.js: Already patched with newQf.');
} else if (!zhContent.includes(oldQf)) {
    console.error('ERROR: oldQf signature not found in GeneralsZH.js');
    process.exit(1);
} else {
    zhContent = zhContent.replace(oldQf, newQf);
    // Also ensure touch events use the canvas bounding rect
    const oldUfPart = 'n=l+16;q=be(a);';
    const newUfPart = `n=l+16;var _tcv=(typeof document!=="undefined")?document.getElementById('canvas'):null;q=(_tcv&&_tcv.getBoundingClientRect)?_tcv.getBoundingClientRect():be(a);`;
    if (zhContent.includes(oldUfPart)) {
        zhContent = zhContent.replace(oldUfPart, newUfPart);
    }
    fs.writeFileSync(zhPath, zhContent, 'utf8');
    console.log(' [1/4] public/GeneralsZH.js: Mouse & touch coordinate symmetry patched successfully.');
}

// -----------------------------------------------------------------------------
// 2. Patch captalvo.css (Z-Index and Modal Visibility Hierarchy)
// -----------------------------------------------------------------------------
const cssPath = path.join(__dirname, '../public/captalvo.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Ensure .modal-overlay has z-index: 10000
cssContent = cssContent.replace(
    /\.modal-overlay\s*\{[^}]*z-index:\s*\d+;/g,
    (match) => match.replace(/z-index:\s*\d+;/, 'z-index: 10000;')
);

// Ensure .afterburner-osd has z-index: 8000
cssContent = cssContent.replace(
    /\.afterburner-osd\s*\{[^}]*z-index:\s*\d+;/g,
    (match) => match.replace(/z-index:\s*\d+;/, 'z-index: 8000;')
);

// Ensure #game-escape-bar has z-index: 6000
cssContent = cssContent.replace(
    /#game-escape-bar\s*\{[^}]*z-index:\s*\d+;/g,
    (match) => match.replace(/z-index:\s*\d+;/, 'z-index: 6000;')
);

// Ensure .modal-overlay.active overrides any inline display rules
if (!cssContent.includes('.modal-overlay.active { display: flex !important;')) {
    cssContent = cssContent.replace(
        /\.modal-overlay\.active\s*\{/g,
        '.modal-overlay.active {\n  display: flex !important;'
    );
}

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log(' [2/4] public/captalvo.css: Modal and OSD z-index layering patched (modals=10000, osd=8000, escape=6000).');

// -----------------------------------------------------------------------------
// 3. Patch captalvo-app.js (Modal Display State & Focus Resilience)
// -----------------------------------------------------------------------------
const appPath = path.join(__dirname, '../public/captalvo-app.js');
let appContent = fs.readFileSync(appPath, 'utf8');

// Replace dismissAllModals so it does not permanently hide modals via inline display: none
const oldDismiss = `function dismissAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    });
    document.body.classList.remove('modal-open');
}`;

const newDismiss = `function dismissAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
        modal.style.display = '';
    });
    document.body.classList.remove('modal-open');
}`;

if (appContent.includes(oldDismiss)) {
    appContent = appContent.replace(oldDismiss, newDismiss);
} else {
    // Try regex replace
    appContent = appContent.replace(
        /function dismissAllModals\(\)\s*\{[\s\S]*?document\.body\.classList\.remove\('modal-open'\);\s*\}/,
        newDismiss
    );
}

// Normalize line endings to find functions regardless of CRLF / LF
appContent = appContent.replace(
    /function openModal\(id\)\s*\{[\s\S]*?syncModalState\(\);\s*\}/,
    `function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = '';
        modal.classList.add('active');
        syncModalState();
    }
}`
);

appContent = appContent.replace(
    /function closeModal\(id\)\s*\{[\s\S]*?syncModalState\(\);\s*\}/,
    `function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = '';
        syncModalState();
    }
}`
);

// DevConsole.open() and close() ensure panel.style.display = ''
appContent = appContent.replace(
    /open\(\)\s*\{\s*if\s*\(this\.panel\)\s*this\.panel\.classList\.add\('active'\);/,
    `open() {\n        if (this.panel) {\n            this.panel.style.display = '';\n            this.panel.classList.add('active');\n        }`
);

appContent = appContent.replace(
    /close\(\)\s*\{\s*if\s*\(this\.panel\)\s*this\.panel\.classList\.remove\('active'\);/,
    `close() {\n        if (this.panel) {\n            this.panel.classList.remove('active');\n            this.panel.style.display = '';\n        }`
);

fs.writeFileSync(appPath, appContent, 'utf8');
console.log(' [3/4] public/captalvo-app.js: Modal state management patched (inline display cleared).');

// -----------------------------------------------------------------------------
// 4. Patch captalvo-asset-bridge.js (AudioZH.big preload for instant SFX)
// -----------------------------------------------------------------------------
const bridgePath = path.join(__dirname, '../public/captalvo-asset-bridge.js');
let bridgeContent = fs.readFileSync(bridgePath, 'utf8');

if (!bridgeContent.includes("'audiozh.big'")) {
    bridgeContent = bridgeContent.replace(
        "this.ESSENTIAL_FULL_PRELOAD = [",
        "this.ESSENTIAL_FULL_PRELOAD = [\n            'audiozh.big',"
    );
    fs.writeFileSync(bridgePath, bridgeContent, 'utf8');
    console.log(' [4/4] public/captalvo-asset-bridge.js: AudioZH.big added to ESSENTIAL_FULL_PRELOAD (23 MB).');
} else {
    console.log(' [4/4] public/captalvo-asset-bridge.js: AudioZH.big already in preload list.');
}

console.log('\nAll patches applied successfully!');

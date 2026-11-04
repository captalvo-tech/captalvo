// ==============================================================================
// TEST: Captalvo Asset Bridge
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const CaptalvoAssetBridge = require('../public/captalvo-asset-bridge.js');
const CaptalvoAdaptiveCache = require('../public/captalvo-cache.js');

function runBridgeTests() {
    console.log('\n--- Running Asset Bridge Tests ---');
    global.window = {
        CaptalvoAdaptiveCache: new CaptalvoAdaptiveCache()
    };

    const bridge = new CaptalvoAssetBridge();

    // 1. Preload synthetic BIG archive
    // BIG Header format: 4 bytes magic, 4 bytes size LE, 4 bytes numFiles BE, 4 bytes headerSize BE
    const syntheticHeader = Buffer.alloc(16);
    syntheticHeader.write('BIGF', 0, 4, 'ascii');
    syntheticHeader.writeUInt32LE(1024, 4);   // Total size 1024
    syntheticHeader.writeUInt32BE(1, 8);      // 1 file
    syntheticHeader.writeUInt32BE(64, 12);    // Header size 64

    const fullSyntheticArchive = Buffer.concat([syntheticHeader, Buffer.alloc(1024 - 16, 0xAA)]);
    bridge.preloadedBuffers.set('ini.big', new Uint8Array(fullSyntheticArchive));

    // 2. Read first 16 bytes
    const first16 = bridge.readRangeSync('INI.big', 0, 15);
    assert.notStrictEqual(first16, null);
    assert.strictEqual(first16.length, 16);

    const magic = String.fromCharCode(...first16.subarray(0, 4));
    assert.strictEqual(magic, 'BIGF');
    console.log('✓ Synchronous reading of first 16 bytes with BIGF magic verified.');

    // 3. Case-insensitivity and relative path handling
    const sliceA = bridge.readRangeSync('assets/ini.big', 0, 15);
    const sliceB = bridge.readRangeSync('/assets/INI.BIG', 0, 15);
    const sliceC = bridge.readRangeSync('Data\\INI\\ini.big', 0, 15);
    assert.deepStrictEqual(sliceA, first16);
    assert.deepStrictEqual(sliceB, first16);
    assert.deepStrictEqual(sliceC, first16);
    console.log('✓ Path normalization, slashes, and case-insensitivity verified.');

    // 4. Localization alias resolution
    bridge.preloadedBuffers.set('brazilianzh.big', new Uint8Array([0x42, 0x49, 0x47, 0x46, 0x99]));
    const aliasRes = bridge.readRangeSync('EnglishZH.big', 0, 4);
    assert.notStrictEqual(aliasRes, null);
    assert.strictEqual(aliasRes[0], 0x42);
    assert.strictEqual(aliasRes[4], 0x99);
    console.log('✓ Localization alias resolution (EnglishZH.big -> BrazilianZH.big) verified.');

    // 5. Missing file handling (must return null, never throw or hang)
    const missing = bridge.readRangeSync('non_existent.big', 0, 15);
    assert.strictEqual(missing, null);
    console.log('✓ Missing file gracefully detected (returns null, no hang, no uncaught error).');

    // 6. Metrics & Ranking
    const stats = bridge.getStats();
    assert.strictEqual(stats.totalReads >= 5, true);
    assert.strictEqual(stats.cacheHits >= 4, true);
    assert.strictEqual(stats.fileRanking.length >= 2, true);
    assert.strictEqual(typeof stats.fileRanking[0].latencyP50, 'number');
    console.log('✓ Bridge metrics, read latencies, and file ranking table verified.');

    // 7. Verify Real NVMe Assets if available
    const realIniPath = 'C:/Users/VIOLI/Captalvo_NVMe_Assets/ZH_Generals/INI.big';
    if (fs.existsSync(realIniPath)) {
        if (global.window && global.window.CaptalvoAdaptiveCache) {
            global.window.CaptalvoAdaptiveCache.clear();
        }
        const realBuf = fs.readFileSync(realIniPath);
        bridge.preloadedBuffers.set('ini.big', new Uint8Array(realBuf));

        const realFirst16 = bridge.readRangeSync('INI.big', 0, 15);
        assert.strictEqual(realFirst16.length, 16);
        const realMagic = String.fromCharCode(...realFirst16.subarray(0, 4));
        assert.strictEqual(realMagic, 'BIGF');

        const realHeader = Buffer.from(realFirst16);
        assert.strictEqual(realHeader.readUInt32LE(4), 7607479);
        console.log('✓ Real user NVMe asset INI.big (7,607,479 bytes) verified through bridge.');
    }

    // 8. Verify Synthesis of EnglishZH.big from BrazilianZH.big & CSF Extraction
    const realBrZhPath = 'C:/Users/VIOLI/Captalvo_NVMe_Assets/BrazilianZH.big';
    if (fs.existsSync(realBrZhPath)) {
        const brU8 = new Uint8Array(fs.readFileSync(realBrZhPath));
        bridge.preloadedBuffers.set('brazilianzh.big', brU8);

        // Key resolution should auto-synthesize EnglishZH.big
        const key = bridge.resolveFileKey('englishzh.big');
        assert.strictEqual(key, 'englishzh.big');
        assert.strictEqual(bridge.preloadedBuffers.has('englishzh.big'), true);

        const engU8 = bridge.preloadedBuffers.get('englishzh.big');
        assert.strictEqual(engU8.byteLength, brU8.byteLength);

        // Verify CSF data extraction
        const csf = bridge.getCSFData();
        assert.notStrictEqual(csf, null);
        assert.strictEqual(csf.length, 665565);
        const csfMagic = String.fromCharCode(...csf.subarray(0, 4));
        assert.strictEqual(csfMagic, ' FSC');
        console.log('✓ Automatic synthesis of EnglishZH.big and CSF string table extraction verified.');
    }

    // 9. Strict Range, Rejection of Incomplete Slices & Unserved Reads Registry
    bridge.preloadedBuffers.set('small.big', new Uint8Array(100));
    const badRange = bridge.readRangeSync('small.big', 80, 120); // only 20 bytes available, requested 41
    assert.strictEqual(badRange, null);
    const unserved = bridge.getUnservedReads();
    assert.strictEqual(unserved.length >= 2, true);
    const lastUnserved = unserved[unserved.length - 1];
    assert.strictEqual(lastUnserved.file, 'small.big');
    assert.strictEqual(lastUnserved.start, 80);
    assert.strictEqual(lastUnserved.end, 120);
    assert.strictEqual(lastUnserved.reqLen, 41);
    console.log('✓ Strict boundary validation and unserved reads tracking verified.');

    // 10. Real Textures.big DDS Texture Range Verification (297433560-297521095)
    const texturePaths = [
        'C:/Users/VIOLI/Command and Conquer Generals Zero Hour/Command and Conquer Generals/Textures.big',
        'C:/Users/VIOLI/Captalvo_NVMe_Assets/Textures.big'
    ];
    let realTexPath = null;
    for (const p of texturePaths) {
        if (fs.existsSync(p)) {
            realTexPath = p;
            break;
        }
    }
    if (realTexPath) {
        const texBuf = fs.readFileSync(realTexPath);
        bridge.preloadedBuffers.set('textures.big', new Uint8Array(texBuf));

        const texSlice = bridge.readRangeSync('textures.big', 297433560, 297521095);
        assert.notStrictEqual(texSlice, null);
        assert.strictEqual(texSlice.length, 87536);
        // Magic 'DDS '
        assert.strictEqual(texSlice[0], 0x44);
        assert.strictEqual(texSlice[1], 0x44);
        assert.strictEqual(texSlice[2], 0x53);
        assert.strictEqual(texSlice[3], 0x20);
        // DDS header size 124 (0x7C)
        assert.strictEqual(texSlice[4], 0x7C);
        assert.strictEqual(texSlice[5], 0x00);
        console.log('✓ Real Textures.big tbbib.dds texture (87,536 bytes, DDS magic) verified through bridge.');
    }

    return true;
}


if (require.main === module) {
    runBridgeTests();
}

module.exports = runBridgeTests;

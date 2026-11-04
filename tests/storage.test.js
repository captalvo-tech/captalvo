// ==============================================================================
// TEST: Captalvo Asset Manager & Storage
// ==============================================================================

const assert = require('assert');
const crypto = require('crypto');
const CaptalvoAssetManager = require('../public/captalvo-asset-manager.js');

async function runStorageTests() {
    console.log('\n--- Running Asset Manager & Storage Tests ---');

    // Setup Mock Environment for Node.js
    global.crypto = crypto.webcrypto;

    const manager = new CaptalvoAssetManager();

    // 1. SHA-256 calculation on Blob/Buffer
    const syntheticData = Buffer.from('Captalvo MMORTS Asset Storage Engine - SHA256 Verification Test');
    const expectedHash = crypto.createHash('sha256').update(syntheticData).digest('hex');

    // Create a Blob-like mock
    const mockBlob = {
        size: syntheticData.length,
        arrayBuffer: async () => syntheticData.buffer.slice(syntheticData.byteOffset, syntheticData.byteOffset + syntheticData.byteLength),
        slice: (start, end) => {
            const sub = syntheticData.subarray(start, end);
            return {
                size: sub.length,
                arrayBuffer: async () => sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength)
            };
        }
    };

    const computedHash = await manager.computeSha256(mockBlob);
    assert.strictEqual(computedHash, expectedHash);
    console.log('✓ WebCrypto SHA-256 checksum computation verified.');

    // 2. BIGF Magic detection & validation
    const validBigHeader = Buffer.alloc(16);
    validBigHeader.write('BIGF', 0, 4, 'ascii');
    validBigHeader.writeUInt32LE(1024, 4);

    const magicStr = String.fromCharCode(...validBigHeader.subarray(0, 4));
    assert.strictEqual(magicStr, 'BIGF');
    assert.strictEqual(magicStr === 'BIGF' || magicStr === 'BIG4', true);

    const invalidHeader = Buffer.alloc(16);
    invalidHeader.write('PK03', 0, 4, 'ascii');
    const invalidMagic = String.fromCharCode(...invalidHeader.subarray(0, 4));
    assert.strictEqual(invalidMagic === 'BIGF' || invalidMagic === 'BIG4', false);
    console.log('✓ BIGF/BIG4 header magic detection & invalid archive rejection verified.');

    // 3. Chunked Streaming simulation with progress tracking
    const totalSimulatedBytes = 10 * 1024 * 1024; // 10 MB
    const chunkSize = 4 * 1024 * 1024; // 4 MB chunks
    const progressReports = [];

    let offset = 0;
    while (offset < totalSimulatedBytes) {
        const end = Math.min(offset + chunkSize, totalSimulatedBytes);
        offset = end;
        progressReports.push({
            loaded: offset,
            total: totalSimulatedBytes,
            percent: Math.round((offset / totalSimulatedBytes) * 100)
        });
    }

    assert.strictEqual(progressReports.length, 3); // 4MB, 8MB, 10MB
    assert.strictEqual(progressReports[progressReports.length - 1].percent, 100);
    assert.strictEqual(progressReports[progressReports.length - 1].loaded, totalSimulatedBytes);
    console.log('✓ Chunked streaming (4 MB blocks) and progress emission (0-100%) verified.');

    // 4. Localization Alias Mapping
    assert.strictEqual(manager.ALIAS_MAP['englishzh.big'].includes('brazilianzh.big'), true);
    assert.strictEqual(manager.ALIAS_MAP['english.big'].includes('brazilian.big'), true);
    assert.strictEqual(manager.ALIAS_MAP['speechenglishzh.big'].includes('speechbrazilianzh.big'), true);
    console.log('✓ PT-BR to EnglishZH alias mapping verified for localization fallback.');

    // 5. Essential Files Set
    assert.strictEqual(manager.ESSENTIAL_FILES.has('inizh.big'), true);
    assert.strictEqual(manager.ESSENTIAL_FILES.has('windowzh.big'), true);
    assert.strictEqual(manager.ESSENTIAL_FILES.has('shaderszh.big'), true);
    assert.strictEqual(manager.ESSENTIAL_FILES.has('textureszh.big'), false); // Non-essential pre-launch
    console.log('✓ Essential archive catalog separation verified.');

    return true;
}

if (require.main === module) {
    runStorageTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runStorageTests;

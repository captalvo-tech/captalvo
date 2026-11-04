// ==============================================================================
// TEST: Captalvo Adaptive Cache
// ==============================================================================

const assert = require('assert');
const CaptalvoAdaptiveCache = require('../public/captalvo-cache.js');

function runCacheTests() {
    console.log('\n--- Running Cache Tests ---');
    const cache = new CaptalvoAdaptiveCache();

    // 1. Storage modes & memory limits
    cache.setMode('economic');
    assert.strictEqual(cache.currentMode, 'economic');
    assert.strictEqual(cache.maxMemoryBytes, 160 * 1024 * 1024);

    cache.setMode('turbo');
    assert.strictEqual(cache.currentMode, 'turbo');
    assert.strictEqual(cache.maxMemoryBytes, 1536 * 1024 * 1024);

    cache.setMode('balanced');
    assert.strictEqual(cache.currentMode, 'balanced');
    assert.strictEqual(cache.maxMemoryBytes, 512 * 1024 * 1024);

    console.log('✓ Storage mode switching and memory budget adjustments verified.');

    // 2. Cache Put and Get
    cache.clearAll();
    const chunk1 = new Uint8Array([1, 2, 3, 4, 5]);
    cache.put('ini.big', 0, 4, chunk1);

    const hit = cache.get('ini.big', 0, 4);
    assert.notStrictEqual(hit, null);
    assert.strictEqual(hit.length, 5);
    assert.strictEqual(hit[0], 1);
    assert.strictEqual(hit[4], 5);

    const miss = cache.get('ini.big', 10, 20);
    assert.strictEqual(miss, null);

    const stats = cache.getStats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hitRatePercent, 50.0);
    console.log('✓ Cache hit, miss, and hit-rate percentage calculation verified.');

    // 3. LRU Eviction under strict limit
    cache.clearAll();
    cache.maxMemoryBytes = 100; // Artificially small budget of 100 bytes

    const b1 = new Uint8Array(40);
    const b2 = new Uint8Array(40);
    const b3 = new Uint8Array(40); // 40 + 40 + 40 = 120 > 100, should evict b1!

    cache.put('archive_a.big', 0, 39, b1, false);
    cache.put('archive_b.big', 0, 39, b2, false);

    // Touch archive_b to make archive_a older
    cache.get('archive_b.big', 0, 39);

    cache.put('archive_c.big', 0, 39, b3, false);

    // archive_a should have been evicted
    assert.strictEqual(cache.get('archive_a.big', 0, 39), null);
    assert.notStrictEqual(cache.get('archive_c.big', 0, 39), null);
    assert.strictEqual(cache.stats.evictions, 1);
    console.log('✓ Deterministic LRU eviction verified under memory pressure.');

    // 4. Pinned entries protection
    cache.clearAll();
    cache.maxMemoryBytes = 80;
    const pinned = new Uint8Array(40);
    const regular = new Uint8Array(40);
    const incoming = new Uint8Array(40);

    cache.put('essential_ini.big', 0, 39, pinned, true); // Pinned!
    cache.put('texture_chunk.big', 0, 39, regular, false); // Regular

    cache.put('incoming.big', 0, 39, incoming, false);

    // Pinned entry must NEVER be evicted
    assert.notStrictEqual(cache.get('essential_ini.big', 0, 39), null);
    assert.strictEqual(cache.get('texture_chunk.big', 0, 39), null);
    console.log('✓ Pinned essential entries (INIs/CSF) protection verified against eviction.');

    return true;
}

if (require.main === module) {
    runCacheTests();
}

module.exports = runCacheTests;

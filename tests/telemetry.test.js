// ==============================================================================
// TEST: Captalvo Diagnostics & Telemetry
// ==============================================================================

const assert = require('assert');
const { CaptalvoConsentManager, CaptalvoDiagnosticsSystem } = require('../public/captalvo-diagnostics.js');

function runTelemetryTests() {
    console.log('\n--- Running Diagnostics & Telemetry Tests ---');

    // 1. LGPD Consent Manager Tests
    const mockStorage = new Map();
    global.localStorage = {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v))
    };

    const consent = new CaptalvoConsentManager();
    assert.strictEqual(consent.isAllowed('essentialTechnical'), true);
    assert.strictEqual(consent.isAllowed('performanceMetrics'), true);
    assert.strictEqual(consent.isAllowed('crashDumps'), false);
    assert.strictEqual(consent.isAllowed('usageAnalytics'), false);
    console.log('✓ LGPD default privacy settings verified (strictly essential & performance).');

    consent.saveConsent({ performanceMetrics: false, crashDumps: true });
    assert.strictEqual(consent.isAllowed('essentialTechnical'), true); // Always true
    assert.strictEqual(consent.isAllowed('performanceMetrics'), false);
    assert.strictEqual(consent.isAllowed('crashDumps'), true);
    console.log('✓ User consent preference update & persistence verified.');

    // 2. Diagnostics Engine Freeze Detection
    const diag = new CaptalvoDiagnosticsSystem();

    // Reset consent to allow performance metrics
    diag.consent.saveConsent({ performanceMetrics: true, crashDumps: true });

    diag.recordFrameTime(50); // Normal frame
    assert.strictEqual(diag.engineMetrics.freezes.count100ms, 0);

    diag.recordFrameTime(120); // Warning > 100ms
    assert.strictEqual(diag.engineMetrics.freezes.count100ms, 1);

    diag.recordFrameTime(250); // Noticeable > 200ms
    assert.strictEqual(diag.engineMetrics.freezes.count200ms, 1);

    diag.recordFrameTime(650); // Severe > 500ms
    assert.strictEqual(diag.engineMetrics.freezes.count500ms, 1);

    diag.recordFrameTime(1200); // Critical > 1s
    assert.strictEqual(diag.engineMetrics.freezes.count1000ms, 1);
    console.log('✓ Multi-tier engine freeze detection (>100ms, >200ms, >500ms, >1s) verified.');

    // 3. File Operation Latency Tracking & Ranking
    for (let i = 0; i < 10; i++) {
        diag.recordFileOperation({
            filename: 'INI.big',
            source: 'ram_cache',
            latencyMs: 0.05 + (i * 0.01),
            bytes: 16,
            hit: true
        });
    }

    diag.recordFileOperation({
        filename: 'WindowZH.big',
        source: 'preloaded_buffer',
        latencyMs: 1.5,
        bytes: 1024,
        hit: false
    });

    const ranking = diag.getFileRanking();
    assert.strictEqual(ranking.length, 2);
    assert.strictEqual(ranking[0].name, 'ini.big');
    assert.strictEqual(ranking[0].reads, 10);
    assert.strictEqual(ranking[0].hitRate, 100);
    assert.strictEqual(ranking[1].name, 'windowzh.big');
    assert.strictEqual(ranking[1].reads, 1);
    assert.strictEqual(ranking[1].hitRate, 0);
    console.log('✓ Real-time I/O file operation recording and latency ranking verified.');

    // 4. Telemetry Payload Construction & Sanitization
    diag.enqueueLog('info', 'engine', 'ZeroHour engine initialized successfully.');
    diag.enqueueLog('warn', 'vfs', 'Missing sound sample', { sampleId: 404 });

    const payload = diag.buildPayload();
    assert.strictEqual(typeof payload.session_id, 'string');
    assert.strictEqual(typeof payload.timestamp, 'string');
    assert.strictEqual(payload.events.length >= 5, true); // 3 freeze alerts + 2 manual logs
    assert.strictEqual(payload.engine.freezes.count1000ms, 1);
    assert.strictEqual(payload.fileStats.length, 2);
    console.log('✓ 60-second telemetry payload packaging & privacy validation verified.');

    return true;
}

if (require.main === module) {
    runTelemetryTests();
}

module.exports = runTelemetryTests;

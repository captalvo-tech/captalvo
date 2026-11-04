// ==============================================================================
// CAPTALVO AUTOMATED TEST SUITE RUNNER
// Executes all component unit & integration tests and summarizes metrics
// ==============================================================================

const path = require('path');

async function main() {
    console.log('================================================================');
    console.log('       CAPTALVO MMORTS - INFRASTRUCTURE & ENGINE TEST SUITE     ');
    console.log('================================================================');

    const startTime = performance.now();
    const results = [];

    const suites = [
        { name: 'Captalvo Adaptive Cache (LRU, Modes, Thrashing)', file: './cache.test.js' },
        { name: 'Captalvo Asset Bridge (Synchronous Range, Fallbacks)', file: './bridge.test.js' },
        { name: 'Captalvo Asset Manager (WebCrypto, OPFS Chunks, BIGF)', file: './storage.test.js' },
        { name: 'Captalvo Diagnostics & Telemetry (LGPD, Freezes, AutoFlush)', file: './telemetry.test.js' },
        { name: 'Captalvo Mouse & Viewport (Resolution, Projection, Hit-Test)', file: './mouse_viewport.test.js' },
        { name: 'Captalvo Dual Engine Routing & Isolation', file: './dual_engine_routing.test.js' }
    ];

    for (const suite of suites) {
        const suiteStart = performance.now();
        try {
            const runner = require(suite.file);
            let success = false;
            if (typeof runner === 'function') {
                const res = runner();
                if (res instanceof Promise) {
                    await res;
                }
                success = true;
            }
            const duration = (performance.now() - suiteStart).toFixed(2);
            results.push({ name: suite.name, status: 'PASSED', duration: `${duration} ms` });
        } catch (err) {
            const duration = (performance.now() - suiteStart).toFixed(2);
            console.error(`\n❌ FAIL in ${suite.name}:`, err);
            results.push({ name: suite.name, status: 'FAILED', duration: `${duration} ms`, error: err.message });
        }
    }

    const totalDuration = (performance.now() - startTime).toFixed(2);
    console.log('\n================================================================');
    console.log('                        TEST SUMMARY REPORT                      ');
    console.log('================================================================');
    console.table(results);
    console.log(`Total Execution Time: ${totalDuration} ms`);

    const failedCount = results.filter(r => r.status === 'FAILED').length;
    if (failedCount > 0) {
        console.error(`\n❌ TEST SUITE FAILED: ${failedCount} test(s) failed.`);
        process.exit(1);
    } else {
        console.log(`\n✅ ALL TESTS PASSED: 100% success rate across all infrastructure layers.`);
        process.exit(0);
    }
}

if (require.main === module) {
    main();
}


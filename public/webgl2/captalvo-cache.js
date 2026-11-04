// ==============================================================================
// CAPTALVO ADAPTIVE CACHE — Intelligent RAM Cache
// Deterministic LRU, Frequency Metrics, Storage Modes & Memory Budgets
// ==============================================================================

'use strict';

class CaptalvoAdaptiveCache {
    constructor() {
        // Supported Storage Modes
        this.MODES = {
            AUTOMATIC: 'automatic',
            ECONOMIC: 'economic',
            BALANCED: 'balanced',
            TURBO: 'turbo'
        };

        // Memory Limits per Mode (in Bytes)
        this.MEMORY_LIMITS = {
            [this.MODES.ECONOMIC]: 160 * 1024 * 1024,   // 160 MB
            [this.MODES.BALANCED]: 512 * 1024 * 1024,   // 512 MB
            [this.MODES.TURBO]: 1536 * 1024 * 1024,     // 1.5 GB
            [this.MODES.AUTOMATIC]: 512 * 1024 * 1024  // Dynamic, adjusted on init
        };

        this.currentMode = this.loadStoredMode();
        this.maxMemoryBytes = this.MEMORY_LIMITS[this.currentMode];
        this.usedMemoryBytes = 0;

        // Cache Entries: Map<key, { data: Uint8Array, size: number, lastUsed: number, hits: number, pinned: boolean, filename: string, start: number, end: number }>
        this.entries = new Map();

        // Metrics
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalBytesServed: 0,
            thrashingAlerts: 0,
            recentRequests: [] // Rolling window for thrashing detection
        };

        this.adjustAutomaticBudget();
    }

    loadStoredMode() {
        try {
            const saved = localStorage.getItem('captalvo_storage_mode');
            if (saved && Object.values(this.MODES).includes(saved)) {
                return saved;
            }
        } catch (e) {}
        return this.MODES.AUTOMATIC;
    }

    setMode(mode) {
        if (!Object.values(this.MODES).includes(mode)) {
            console.warn('[CaptalvoCache] Modo de armazenamento inválido:', mode);
            return;
        }
        this.currentMode = mode;
        try {
            localStorage.setItem('captalvo_storage_mode', mode);
        } catch (e) {}

        if (mode === this.MODES.AUTOMATIC) {
            this.adjustAutomaticBudget();
        } else {
            this.maxMemoryBytes = this.MEMORY_LIMITS[mode];
        }

        console.log(`[CaptalvoCache] Modo alterado para '${mode}'. Orçamento de RAM: ${(this.maxMemoryBytes / (1024 * 1024)).toFixed(0)} MB`);
        this.enforceMemoryLimit();
    }

    adjustAutomaticBudget() {
        let ramGB = 4;
        if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
            ramGB = navigator.deviceMemory;
        }

        if (ramGB >= 16) {
            this.maxMemoryBytes = 1600 * 1024 * 1024; // 1.6 GB on 16GB+ systems (accommodates Audio + Textures + W3D)
        } else if (ramGB >= 8) {
            this.maxMemoryBytes = 1024 * 1024 * 1024; // 1.0 GB on 8GB systems
        } else if (ramGB >= 4) {
            this.maxMemoryBytes = 512 * 1024 * 1024;  // 512 MB on 4GB systems
        } else {
            this.maxMemoryBytes = 256 * 1024 * 1024;  // 256 MB on low-RAM systems
        }
    }

    makeKey(filename, start, end) {
        return `${filename.toLowerCase()}:${start}-${end}`;
    }

    get(filename, start, end) {
        const key = this.makeKey(filename, start, end);
        const entry = this.entries.get(key);

        if (entry) {
            entry.lastUsed = performance.now();
            entry.hits++;
            this.stats.hits++;
            this.stats.totalBytesServed += entry.size;
            return entry.data;
        }

        this.stats.misses++;
        this.trackRequestForThrashing(key);
        return null;
    }

    put(filename, start, end, data, pinned = false) {
        if (!data || data.byteLength === 0) return;

        const key = this.makeKey(filename, start, end);
        const size = data.byteLength;

        // If existing entry, update it
        if (this.entries.has(key)) {
            const old = this.entries.get(key);
            this.usedMemoryBytes -= old.size;
            old.data = data;
            old.size = size;
            old.lastUsed = performance.now();
            old.pinned = pinned || old.pinned;
            this.usedMemoryBytes += size;
            this.enforceMemoryLimit();
            return;
        }

        // Before adding, make sure we have room
        while (this.usedMemoryBytes + size > this.maxMemoryBytes && this.canEvict()) {
            this.evictOne();
        }

        const entry = {
            filename: filename.toLowerCase(),
            start,
            end,
            data,
            size,
            lastUsed: performance.now(),
            hits: 1,
            pinned
        };

        this.entries.set(key, entry);
        this.usedMemoryBytes += size;
    }

    canEvict() {
        for (const entry of this.entries.values()) {
            if (!entry.pinned) return true;
        }
        return false;
    }

    evictOne() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.entries.entries()) {
            if (entry.pinned) continue;
            // Weigh by recency and frequency (lower score = evict first)
            const score = entry.lastUsed + (entry.hits * 1000);
            if (score < oldestTime) {
                oldestTime = score;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            const entry = this.entries.get(oldestKey);
            this.usedMemoryBytes -= entry.size;
            this.entries.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    enforceMemoryLimit() {
        while (this.usedMemoryBytes > this.maxMemoryBytes && this.canEvict()) {
            this.evictOne();
        }
    }

    clearNonPinned() {
        const toDelete = [];
        for (const [key, entry] of this.entries.entries()) {
            if (!entry.pinned) {
                this.usedMemoryBytes -= entry.size;
                toDelete.push(key);
            }
        }
        for (const k of toDelete) {
            this.entries.delete(k);
        }
        console.log(`[CaptalvoCache] Cache RAM liberado. Memória ativa restante: ${(this.usedMemoryBytes / (1024 * 1024)).toFixed(2)} MB`);
    }

    clearAll() {
        this.entries.clear();
        this.usedMemoryBytes = 0;
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.evictions = 0;
        this.stats.totalBytesServed = 0;
    }

    clear() {
        this.clearAll();
    }

    trackRequestForThrashing(key) {
        const now = performance.now();
        this.stats.recentRequests.push({ key, time: now });

        // Keep last 50 requests within 5 seconds
        if (this.stats.recentRequests.length > 50) {
            this.stats.recentRequests.shift();
        }

        const recentSame = this.stats.recentRequests.filter(r => r.key === key && (now - r.time < 3000));
        if (recentSame.length >= 4) {
            this.stats.thrashingAlerts++;
            // Dynamically increase memory limit by 32 MB if thrashing detected
            if (this.maxMemoryBytes < 1536 * 1024 * 1024) {
                this.maxMemoryBytes += 32 * 1024 * 1024;
                console.warn(`[CaptalvoCache] Thrashing detectado para ${key}. Expandindo orçamento de RAM temporariamente para ${(this.maxMemoryBytes / (1024 * 1024)).toFixed(0)} MB.`);
            }
        }
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : '0.0';

        return {
            mode: this.currentMode,
            entriesCount: this.entries.size,
            usedMB: +(this.usedMemoryBytes / (1024 * 1024)).toFixed(2),
            maxMB: +(this.maxMemoryBytes / (1024 * 1024)).toFixed(2),
            usagePercent: +((this.usedMemoryBytes / Math.max(1, this.maxMemoryBytes)) * 100).toFixed(1),
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRatePercent: parseFloat(hitRate),
            evictions: this.stats.evictions,
            totalBytesServedMB: +(this.stats.totalBytesServed / (1024 * 1024)).toFixed(2),
            thrashingAlerts: this.stats.thrashingAlerts
        };
    }
}

// Global Singleton & CommonJS Export
if (typeof window !== 'undefined') {
    window.CaptalvoAdaptiveCache = new CaptalvoAdaptiveCache();
}
if (typeof module !== 'undefined') {
    module.exports = CaptalvoAdaptiveCache;
}

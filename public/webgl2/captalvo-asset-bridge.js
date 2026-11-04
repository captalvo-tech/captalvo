// ==============================================================================
// CAPTALVO ASSET BRIDGE — Engine ↔ Storage Centralized Bridge
// High-Speed Synchronous Range Provider, RAM Buffer Coordinator & Metrics
// ==============================================================================

'use strict';

class CaptalvoAssetBridge {
    constructor() {
        // In-memory complete buffers: Map<lowercaseName, Uint8Array>
        this.preloadedBuffers = new Map();

        // In-memory header buffers (first 2 MB): Map<lowercaseName, Uint8Array>
        this.preloadedHeaders = new Map();

        // Active Storage Mode
        this.storageMode = 'automatic';

        // Read Statistics
        this.metrics = {
            totalReads: 0,
            totalBytes: 0,
            cacheHits: 0,
            cacheMisses: 0,
            byFile: new Map() // Map<filename, { reads, bytes, hits, misses, latencies: [] }>
        };

        // Unserved Reads Registry (Tracking all unfulfilled sync requests)
        this.unservedReads = [];

        // Alias resolution map
        this.ALIAS_MAP = {
            'englishzh.big': ['brazilianzh.big', 'englishzh.big'],
            'english.big': ['brazilian.big', 'english.big'],
            'speechenglishzh.big': ['speechbrazilianzh.big', 'speechzh.big', 'speechenglishzh.big'],
            'speechenglish.big': ['speechbrazilian.big', 'speech.big', 'speechenglish.big'],
            'audioenglishzh.big': ['audiobrazilianzh.big', 'audiozh.big', 'audioenglishzh.big'],
            'audioenglish.big': ['audiobrazilian.big', 'audio.big', 'audioenglish.big'],
            'w3denglishzh.big': ['w3dbrazilianzh.big', 'w3denglishzh.big']
        };

        // Core Essential Files required in full RAM for zero-stutter initialization
        this.ESSENTIAL_FULL_PRELOAD = [
            'inizh.big', 'ini.big',
            'windowzh.big', 'window.big',
            'patchini.big', 'patchwindow.big', 'patchzh.big', 'patch.big',
            'shaderszh.big', 'shaders.big',
            'genseczh.big', 'gensec.big',
            'brazilianzh.big', 'englishzh.big',
            'brazilian.big', 'english.big',
            'terrainzh.big', 'terrain.big',
            'mapszh.big',
            'audiozh.big', 'audio.big',
            'audiobrazilianzh.big', 'audiobrazilian.big'
        ];
    }

    /**
     * Synthesize an English .big archive from a Brazilian .big archive
     * Rewrites directory entries from Data\Brazilian\... to Data\English\...
     * preserving all exact byte offsets and payload alignments.
     */
    transformToEnglishBig(srcU8) {
        if (!srcU8 || srcU8.byteLength < 16) return null;
        try {
            const view = new DataView(srcU8.buffer, srcU8.byteOffset, srcU8.byteLength);

            const m0 = srcU8[0], m1 = srcU8[1], m2 = srcU8[2], m3 = srcU8[3];
            if (m0 !== 0x42 || m1 !== 0x49 || m2 !== 0x47 || (m3 !== 0x46 && m3 !== 0x34)) {
                return null;
            }

            const totalSize = view.getUint32(4, true);
            const numFiles = view.getUint32(8, false);
            const origHeaderSize = view.getUint32(12, false);

            let pos = 16;
            const entries = [];
            const decoder = new TextDecoder('ascii');
            const encoder = new TextEncoder();

            for (let i = 0; i < numFiles; i++) {
                if (pos + 8 >= srcU8.byteLength) break;
                const offset = view.getUint32(pos, false);
                const size = view.getUint32(pos + 4, false);
                pos += 8;

                const nameStart = pos;
                while (pos < srcU8.byteLength && srcU8[pos] !== 0) {
                    pos++;
                }
                const nameBytes = srcU8.subarray(nameStart, pos);
                pos++;

                const nameStr = decoder.decode(nameBytes);
                const newNameStr = nameStr.replace(/brazilian/gi, 'English');
                entries.push({ offset, size, name: newNameStr });
            }

            const outU8 = new Uint8Array(srcU8.byteLength);
            const outView = new DataView(outU8.buffer);

            // Copy payload exactly as-is from origHeaderSize onwards
            outU8.set(srcU8.subarray(origHeaderSize), origHeaderSize);

            // Write BIGF header
            outU8[0] = 0x42; outU8[1] = 0x49; outU8[2] = 0x47; outU8[3] = m3;
            outView.setUint32(4, totalSize, true);
            outView.setUint32(8, numFiles, false);
            outView.setUint32(12, origHeaderSize, false);

            let wPos = 16;
            for (const e of entries) {
                outView.setUint32(wPos, e.offset, false);
                outView.setUint32(wPos + 4, e.size, false);
                wPos += 8;
                const encodedName = encoder.encode(e.name);
                outU8.set(encodedName, wPos);
                wPos += encodedName.length;
                outU8[wPos++] = 0;
            }

            while (wPos < origHeaderSize) {
                outU8[wPos++] = 0;
            }

            return outU8;
        } catch (err) {
            console.error('[CaptalvoBridge] Erro ao transformar archive para English:', err);
            return null;
        }
    }

    /**
     * Extract generals.csf payload directly from a .big archive buffer
     */
    extractCSFFromBuffer(u8) {
        if (!u8 || u8.byteLength < 16) return null;
        try {
            const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            const numFiles = view.getUint32(8, false);
            let pos = 16;
            for (let i = 0; i < numFiles; i++) {
                if (pos + 8 >= u8.byteLength) break;
                const offset = view.getUint32(pos, false);
                const size = view.getUint32(pos + 4, false);
                pos += 8;

                const nameStart = pos;
                while (pos < u8.byteLength && u8[pos] !== 0) {
                    pos++;
                }
                let name = '';
                for (let j = nameStart; j < pos; j++) {
                    name += String.fromCharCode(u8[j]);
                }
                pos++;
                if (name.toLowerCase().endsWith('.csf')) {
                    return u8.subarray(offset, offset + size);
                }
            }
        } catch (e) {
            console.warn('[CaptalvoBridge] Erro ao extrair CSF de buffer:', e);
        }
        return null;
    }

    /**
     * Get extracted CSF string table data for Emscripten FS injection
     */
    getCSFData() {
        const candidates = ['englishzh.big', 'brazilianzh.big', 'english.big', 'brazilian.big'];
        for (const cand of candidates) {
            if (this.preloadedBuffers.has(cand)) {
                const csf = this.extractCSFFromBuffer(this.preloadedBuffers.get(cand));
                if (csf && csf.length > 0) return csf;
            }
        }
        return null;
    }

    normalizeFilename(rawPath) {
        if (!rawPath) return '';
        let clean = rawPath.replace(/\\/g, '/').trim();
        const parts = clean.split('/');
        let filename = parts[parts.length - 1];
        return filename.toLowerCase();
    }

    resolveFileKey(normalizedName) {
        if (this.preloadedBuffers.has(normalizedName) || this.preloadedHeaders.has(normalizedName)) {
            return normalizedName;
        }

        // On-the-fly English archive synthesis from Brazilian edition
        if (normalizedName === 'englishzh.big' && this.preloadedBuffers.has('brazilianzh.big')) {
            const eng = this.transformToEnglishBig(this.preloadedBuffers.get('brazilianzh.big'));
            if (eng) {
                this.preloadedBuffers.set('englishzh.big', eng);
                console.log('[CaptalvoBridge] EnglishZH.big sintetizado a partir de BrazilianZH.big com sucesso.');
                return 'englishzh.big';
            }
        }
        if (normalizedName === 'english.big' && this.preloadedBuffers.has('brazilian.big')) {
            const eng = this.transformToEnglishBig(this.preloadedBuffers.get('brazilian.big'));
            if (eng) {
                this.preloadedBuffers.set('english.big', eng);
                console.log('[CaptalvoBridge] English.big sintetizado a partir de Brazilian.big com sucesso.');
                return 'english.big';
            }
        }

        // Try aliases
        if (this.ALIAS_MAP[normalizedName]) {
            for (const candidate of this.ALIAS_MAP[normalizedName]) {
                if (this.preloadedBuffers.has(candidate) || this.preloadedHeaders.has(candidate)) {
                    return candidate;
                }
            }
        }

        return normalizedName;
    }

    /**
     * Synchronous Range Reader called by WASM engine via ki(a, b, c, d)
     * Rigorously validates offsets and lengths. Never returns incomplete slices.
     * Registers all unserved reads and avoids any synchronous HTTP fallback.
     * @param {string} rawPath - Requested file path/name
     * @param {number} start - Start byte offset
     * @param {number} end - End byte offset (inclusive)
     * @returns {Uint8Array|null} Sliced bytes or null
     */
    readRangeSync(rawPath, start, end) {
        const t0 = performance.now();
        const norm = this.normalizeFilename(rawPath);
        const key = this.resolveFileKey(norm);

        // Rigorous validation of input range
        if (typeof start !== 'number' || typeof end !== 'number' || isNaN(start) || isNaN(end) || start < 0 || end < start) {
            console.error(`[CaptalvoBridge] Intervalo inválido solicitado para ${rawPath}: start=${start}, end=${end}`);
            return null;
        }

        const reqLen = end - start + 1;
        let result = null;
        let source = 'none';

        // 1. Check Adaptive RAM Cache
        if (window.CaptalvoAdaptiveCache) {
            const cached = window.CaptalvoAdaptiveCache.get(key, start, end);
            if (cached && cached.length === reqLen) {
                result = cached;
                source = 'ram_cache';
            }
        }

        // 2. Check Fully Preloaded Buffers
        if (!result && this.preloadedBuffers.has(key)) {
            let buf = this.preloadedBuffers.get(key);
            if ((key === 'englishzh.big' || key === 'english.big') && (!this._transformedSet || !this._transformedSet.has(key))) {
                const transformed = this.transformToEnglishBig(buf);
                if (transformed) {
                    buf = transformed;
                    this.preloadedBuffers.set(key, buf);
                    this._transformedSet = this._transformedSet || new Set();
                    this._transformedSet.add(key);
                }
            }

            // Strict boundary validation: requested interval must fit completely inside buffer
            if (start < buf.length && (end + 1) <= buf.length) {
                result = buf.subarray(start, end + 1);
                source = 'preloaded_buffer';
            } else if (start < buf.length) {
                console.warn(`[CaptalvoBridge] Leitura parcial além do fim de ${key} (${start}-${end}, tamanho buffer: ${buf.length})`);
            }
        }

        // 3. Check Preloaded Header Buffers (first 2 MB index)
        if (!result && this.preloadedHeaders.has(key)) {
            const headerBuf = this.preloadedHeaders.get(key);
            // Strict boundary validation: must fit completely inside header buffer
            if (start < headerBuf.length && (end + 1) <= headerBuf.length) {
                result = headerBuf.subarray(start, end + 1);
                source = 'preloaded_header';
            }
        }

        // Integrity verification: NEVER return incomplete slice
        if (result && result.length !== reqLen) {
            console.error(`[CaptalvoBridge] Inconsistência de tamanho em ${key}: esperado ${reqLen}, obtido ${result.length}. Rejeitando fatia.`);
            result = null;
        }

        const durationMs = performance.now() - t0;
        this.recordMetrics(key, start, reqLen, durationMs, result !== null, source);

        if (!result) {
            const unserved = {
                file: key,
                rawPath,
                start,
                end,
                reqLen,
                source: 'unserved',
                timestamp: Date.now()
            };
            this.unservedReads.push(unserved);
            if (this.unservedReads.length > 500) {
                this.unservedReads.shift();
            }

            console.warn(`[CaptalvoBridge] Recurso ausente na RAM para leitura síncrona: ${norm} (${start}-${end}, ${reqLen} bytes)`);

            if (window.CaptalvoDiagnostics && window.CaptalvoDiagnostics.recordUnservedRead) {
                window.CaptalvoDiagnostics.recordUnservedRead(unserved);
            }
        }

        return result;
    }

    getUnservedReads() {
        return [...this.unservedReads];
    }

    recordMetrics(file, offset, length, durationMs, hit, source) {
        this.metrics.totalReads++;
        if (hit) {
            this.metrics.cacheHits++;
            this.metrics.totalBytes += length;
        } else {
            this.metrics.cacheMisses++;
        }

        if (!this.metrics.byFile.has(file)) {
            this.metrics.byFile.set(file, {
                reads: 0,
                bytes: 0,
                hits: 0,
                misses: 0,
                totalDurationMs: 0,
                latencies: []
            });
        }

        const fileStats = this.metrics.byFile.get(file);
        fileStats.reads++;
        if (hit) {
            fileStats.hits++;
            fileStats.bytes += length;
        } else {
            fileStats.misses++;
        }
        fileStats.totalDurationMs += durationMs;

        // Keep last 100 latency samples for percentiles
        if (fileStats.latencies.length < 100) {
            fileStats.latencies.push(durationMs);
        } else {
            fileStats.latencies[Math.floor(Math.random() * 100)] = durationMs;
        }

        // Forward to Diagnostics system if present
        if (window.CaptalvoDiagnostics && window.CaptalvoDiagnostics.recordFileOperation) {
            window.CaptalvoDiagnostics.recordFileOperation({
                file,
                offset,
                length,
                durationMs,
                hit,
                source,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Prepares all required game assets in RAM before starting WebAssembly.
     * Guaranteed to load essential INIs, Window, CSF and headers of all archives.
     * Selectively and safely preloads Textures.big, TexturesZH.big, W3D.big, W3DZH.big
     * when memory budget allows, without duplicating buffers or triggering OOM.
     */
    async prepareAssetsForLaunch(mode = 'automatic', progressCb = null) {
        this.storageMode = mode;
        if (window.CaptalvoAdaptiveCache) {
            window.CaptalvoAdaptiveCache.setMode(mode);
        }

        if (progressCb) progressCb('Inicializando gerenciador de arquivos...', 10);
        if (!window.CaptalvoAssetManager) {
            throw new Error('CaptalvoAssetManager não encontrado.');
        }
        await window.CaptalvoAssetManager.init();

        const metas = await window.CaptalvoAssetManager.listAllMeta();
        if (metas.length === 0) {
            throw new Error('Nenhum arquivo .big encontrado no armazenamento. Importe os arquivos do Zero Hour antes de iniciar.');
        }

        // Memory Budget Assessment
        const devMemGB = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 8;
        const heapLimitBytes = (typeof performance !== 'undefined' && performance.memory && performance.memory.jsHeapSizeLimit)
            ? performance.memory.jsHeapSizeLimit
            : 4 * 1024 * 1024 * 1024;
        const heapLimitMB = Math.round(heapLimitBytes / (1024 * 1024));

        // Policy:
        // Textures (530 MB): Allowed if Turbo, or if not Economic on systems with >= 8GB RAM or >= 1.5GB Heap Limit
        // W3D 3D Models (357 MB): Allowed if Turbo, or if not Economic on systems with >= 8GB RAM and >= 2.5GB Heap Limit
        const canPreloadTextures = (mode === 'turbo') || (mode !== 'economic' && (devMemGB >= 8 || heapLimitMB >= 1500));
        const canPreloadW3D = (mode === 'turbo') || (mode !== 'economic' && (devMemGB >= 8 && heapLimitMB >= 2500));

        const GRAPHICS_PRELOAD = new Set();
        if (canPreloadTextures) {
            GRAPHICS_PRELOAD.add('textureszh.big');
            GRAPHICS_PRELOAD.add('textures.big');
        }
        if (canPreloadW3D) {
            GRAPHICS_PRELOAD.add('w3dzh.big');
            GRAPHICS_PRELOAD.add('w3d.big');
        }

        console.log(`[CaptalvoBridge] Preparando ativos para '${mode}'. RAM: ${devMemGB}GB, Heap: ${heapLimitMB}MB. Preload Texturas: ${canPreloadTextures}, Preload W3D: ${canPreloadW3D}`);

        const totalSteps = metas.length;
        let processed = 0;

        // 1. Scan and load files
        for (const meta of metas) {
            const lower = meta.name.toLowerCase();
            const isEssential = this.ESSENTIAL_FULL_PRELOAD.includes(lower);
            const isGraphics = GRAPHICS_PRELOAD.has(lower);

            processed++;
            const pct = 10 + Math.round((processed / totalSteps) * 80);

            if (isEssential || isGraphics || mode === 'turbo') {
                if (progressCb) {
                    const mb = (meta.size / (1024 * 1024)).toFixed(1);
                    const tag = isGraphics ? 'Recurso Gráfico' : 'Núcleo Essencial';
                    progressCb(`Carregando ${meta.name} (${tag}, ${mb} MB)...`, pct);
                }

                try {
                    const buffer = await window.CaptalvoAssetManager.readFileBuffer(meta.name);
                    if (buffer) {
                        let u8 = new Uint8Array(buffer);

                        // If archive is EnglishZH or English, ensure it has English paths
                        if (lower === 'englishzh.big' || lower === 'english.big') {
                            const transformed = this.transformToEnglishBig(u8);
                            if (transformed) {
                                u8 = transformed;
                            }
                        }

                        this.preloadedBuffers.set(lower, u8);

                        // Auto-synthesize English counterpart from Brazilian edition
                        if (lower === 'brazilianzh.big') {
                            const engU8 = this.transformToEnglishBig(u8);
                            if (engU8) {
                                this.preloadedBuffers.set('englishzh.big', engU8);
                                console.log('[CaptalvoBridge] EnglishZH.big sintetizado para compatibilidade com o motor.');
                            }
                        } else if (lower === 'brazilian.big') {
                            const engU8 = this.transformToEnglishBig(u8);
                            if (engU8) {
                                this.preloadedBuffers.set('english.big', engU8);
                                console.log('[CaptalvoBridge] English.big sintetizado para compatibilidade com o motor.');
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[CaptalvoBridge] Falha ao pré-carregar ${meta.name}:`, e);
                }
            } else {
                // For non-essential large archives (Audio, Speech, Video):
                // Preload the first 2 MB (contains BIG header and complete file directory table)
                if (progressCb) progressCb(`Indexando cabeçalhos de ${meta.name}...`, pct);
                try {
                    const headerLen = Math.min(2 * 1024 * 1024, meta.size);
                    const headerSlice = await window.CaptalvoAssetManager.readFileSlice(meta.name, 0, headerLen - 1);
                    if (headerSlice) {
                        this.preloadedHeaders.set(lower, headerSlice);
                    }
                } catch (e) {
                    console.warn(`[CaptalvoBridge] Falha ao ler cabeçalho de ${meta.name}:`, e);
                }
            }
        }

        // Final safety pass: Guarantee EnglishZH.big and English.big are present and English-transformed
        if (!this.preloadedBuffers.has('englishzh.big') && this.preloadedBuffers.has('brazilianzh.big')) {
            const engU8 = this.transformToEnglishBig(this.preloadedBuffers.get('brazilianzh.big'));
            if (engU8) {
                this.preloadedBuffers.set('englishzh.big', engU8);
                console.log('[CaptalvoBridge] EnglishZH.big garantido em RAM a partir de BrazilianZH.big.');
            }
        }
        if (!this.preloadedBuffers.has('english.big') && this.preloadedBuffers.has('brazilian.big')) {
            const engU8 = this.transformToEnglishBig(this.preloadedBuffers.get('brazilian.big'));
            if (engU8) {
                this.preloadedBuffers.set('english.big', engU8);
                console.log('[CaptalvoBridge] English.big garantido em RAM a partir de Brazilian.big.');
            }
        }

        // Validate critical archives
        const iniValid = this.preloadedBuffers.has('inizh.big') || this.preloadedBuffers.has('ini.big');
        const windowValid = this.preloadedBuffers.has('windowzh.big') || this.preloadedBuffers.has('window.big');

        if (!iniValid) {
            console.warn('[CaptalvoBridge] AVISO: INIZH.big não está pré-carregado!');
        }
        if (!windowValid) {
            console.warn('[CaptalvoBridge] AVISO: WindowZH.big não está pré-carregado!');
        }

        // Verification probe for Textures.big (297433560-297521095)
        if (this.preloadedBuffers.has('textures.big')) {
            const testSlice = this.readRangeSync('textures.big', 297433560, 297521095);
            if (testSlice && testSlice.length === 87536 && testSlice[0] === 0x44 && testSlice[1] === 0x44 && testSlice[2] === 0x53 && testSlice[3] === 0x20) {
                console.log('[CaptalvoBridge] Verificação de integridade: Textures.big (297433560-297521095) validado com sucesso (DDS magic, 87,536 bytes).');
            } else {
                console.warn('[CaptalvoBridge] AVISO: Falha na validação do intervalo de Textures.big!');
            }
        }

        // Calculate total preloaded RAM footprint
        let totalRAMBytes = 0;
        for (const buf of this.preloadedBuffers.values()) {
            totalRAMBytes += buf.byteLength;
        }
        for (const hBuf of this.preloadedHeaders.values()) {
            totalRAMBytes += hBuf.byteLength;
        }
        const totalRAMMB = (totalRAMBytes / (1024 * 1024)).toFixed(1);

        if (progressCb) progressCb('Ponte de arquivos pronta. Inicializando motor...', 100);
        console.log(`[CaptalvoBridge] Preparação concluída. ${this.preloadedBuffers.size} arquivos completos e ${this.preloadedHeaders.size} cabeçalhos em RAM (${totalRAMMB} MB total alocados).`);
        return true;
    }

    getStats() {
        const total = this.metrics.totalReads;
        const hitRate = total > 0 ? ((this.metrics.cacheHits / total) * 100).toFixed(1) : '0.0';

        const fileRanking = [];
        for (const [name, stats] of this.metrics.byFile.entries()) {
            const lats = [...stats.latencies].sort((a, b) => a - b);
            const p50 = lats.length > 0 ? lats[Math.floor(lats.length * 0.5)].toFixed(2) : '0.00';
            const p95 = lats.length > 0 ? lats[Math.floor(lats.length * 0.95)].toFixed(2) : '0.00';
            const p99 = lats.length > 0 ? lats[Math.floor(lats.length * 0.99)].toFixed(2) : '0.00';

            fileRanking.push({
                file: name,
                reads: stats.reads,
                bytesMB: +(stats.bytes / (1024 * 1024)).toFixed(2),
                hitPercent: stats.reads > 0 ? +((stats.hits / stats.reads) * 100).toFixed(1) : 0,
                latencyP50: parseFloat(p50),
                latencyP95: parseFloat(p95),
                latencyP99: parseFloat(p99),
                totalWaitMs: +(stats.totalDurationMs).toFixed(1)
            });
        }

        fileRanking.sort((a, b) => b.reads - a.reads);

        return {
            storageMode: this.storageMode,
            totalReads: this.metrics.totalReads,
            totalBytesMB: +(this.metrics.totalBytes / (1024 * 1024)).toFixed(2),
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses,
            hitRatePercent: parseFloat(hitRate),
            preloadedFullCount: this.preloadedBuffers.size,
            preloadedHeaderCount: this.preloadedHeaders.size,
            unservedReadsCount: this.unservedReads.length,
            fileRanking
        };
    }
}

// Global Singleton & CommonJS Export
if (typeof window !== 'undefined') {
    window.CaptalvoAssetBridge = new CaptalvoAssetBridge();
}
if (typeof module !== 'undefined') {
    module.exports = CaptalvoAssetBridge;
}

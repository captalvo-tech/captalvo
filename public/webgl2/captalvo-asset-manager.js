// ==============================================================================
// CAPTALVO ASSET MANAGER — OPFS, IndexedDB Catalog, Integrity & Storage
// ==============================================================================

'use strict';

class CaptalvoAssetManager {
    constructor() {
        this.dbName = 'captalvo_catalog';
        this.dbVersion = 1;
        this.db = null;
        this.opfsRoot = null;
        this.assetsDir = null;
        this.isInitialized = false;

        // Alias Map for Localization & Engine Compatibility
        this.ALIAS_MAP = {
            'englishzh.big': ['brazilianzh.big', 'englishzh.big'],
            'english.big': ['brazilian.big', 'english.big'],
            'speechenglishzh.big': ['speechbrazilianzh.big', 'speechzh.big', 'speechenglishzh.big'],
            'speechenglish.big': ['speechbrazilian.big', 'speech.big', 'speechenglish.big'],
            'audioenglishzh.big': ['audiobrazilianzh.big', 'audiozh.big', 'audioenglishzh.big'],
            'audioenglish.big': ['audiobrazilian.big', 'audio.big', 'audioenglish.big'],
            'w3denglishzh.big': ['w3dbrazilianzh.big', 'w3denglishzh.big']
        };

        // Essential Core Files
        this.ESSENTIAL_FILES = new Set([
            'inizh.big', 'windowzh.big', 'patchini.big', 'shaderszh.big',
            'ini.big', 'window.big', 'shaders.big', 'patch.big', 'gensec.big', 'genseczh.big'
        ]);
    }

    async init() {
        if (this.isInitialized) return;

        // 1. Initialize IndexedDB
        await this.initIndexedDB();

        // 2. Initialize OPFS
        await this.initOPFS();

        // 3. Request storage persistence
        await this.requestPersistence();

        // 4. Synchronize catalog with OPFS
        await this.syncCatalogWithOPFS();

        // 5. Auto-repair/synthesize English archives with native English directory tables
        await this.repairEnglishArchives();

        this.isInitialized = true;
        console.log('[CaptalvoAssetManager] Sistema de armazenamento e catálogo pronto.');
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('assets_meta')) {
                    const store = db.createObjectStore('assets_meta', { keyPath: 'name' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('importedAt', 'importedAt', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            req.onerror = (e) => {
                console.error('[CaptalvoAssetManager] Erro abrindo IndexedDB:', e);
                resolve(null);
            };
        });
    }

    async initOPFS() {
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
            try {
                this.opfsRoot = await navigator.storage.getDirectory();
                this.assetsDir = await this.opfsRoot.getDirectoryHandle('assets', { create: true });
                return true;
            } catch (err) {
                console.warn('[CaptalvoAssetManager] Falha ao acessar OPFS:', err);
                return false;
            }
        }
        return false;
    }

    async requestPersistence() {
        if (navigator.storage && navigator.storage.persist) {
            try {
                const isPersisted = await navigator.storage.persist();
                console.log(`[CaptalvoAssetManager] Persistência de armazenamento: ${isPersisted ? 'CONCEDIDA' : 'PADRÃO'}`);
                return isPersisted;
            } catch (e) {}
        }
        return false;
    }

    async getStorageQuota() {
        let quota = { totalGB: null, usedMB: null, percent: null, persisted: false };
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const est = await navigator.storage.estimate();
                quota.totalGB = est.quota ? +(est.quota / (1024 * 1024 * 1024)).toFixed(2) : null;
                quota.usedMB = est.usage ? +(est.usage / (1024 * 1024)).toFixed(2) : null;
                if (est.quota && est.usage) {
                    quota.percent = +((est.usage / est.quota) * 100).toFixed(1);
                }
            } catch (e) {}
        }
        if (navigator.storage && navigator.storage.persisted) {
            try {
                quota.persisted = await navigator.storage.persisted();
            } catch (e) {}
        }
        return quota;
    }

    async storeFileChunked(filename, fileOrBlob, onProgress = null) {
        if (!this.assetsDir) await this.initOPFS();
        if (!this.assetsDir) throw new Error('OPFS não suportado ou indisponível.');

        const targetHandle = await this.assetsDir.getFileHandle(filename, { create: true });
        const writable = await targetHandle.createWritable();

        const totalSize = fileOrBlob.size;
        const chunkSize = 4 * 1024 * 1024; // 4 MB chunks
        let offset = 0;

        // Hash stream calculation using Web Crypto
        const sha256 = await this.computeSha256(fileOrBlob);

        // Read and verify first 16 bytes for BIG magic
        const first16Buffer = await fileOrBlob.slice(0, 16).arrayBuffer();
        const first16Bytes = new Uint8Array(first16Buffer);
        const magic = String.fromCharCode(...first16Bytes.subarray(0, 4));
        const isValidMagic = (magic === 'BIGF' || magic === 'BIG4');

        // Stream to OPFS writable
        while (offset < totalSize) {
            const end = Math.min(offset + chunkSize, totalSize);
            const chunk = fileOrBlob.slice(offset, end);
            await writable.write(chunk);
            offset = end;

            if (onProgress) {
                onProgress({
                    filename,
                    loaded: offset,
                    total: totalSize,
                    percent: Math.round((offset / totalSize) * 100)
                });
            }
        }

        await writable.close();

        // Also duplicate to aliases if Portuguese edition
        await this.handleLocalizationAliases(filename, fileOrBlob);

        // Store metadata in IndexedDB catalog
        const meta = {
            name: filename,
            canonicalName: filename.toLowerCase(),
            size: totalSize,
            sha256: sha256,
            magic: magic,
            isValidMagic: isValidMagic,
            importedAt: new Date().toISOString(),
            version: 1,
            status: isValidMagic ? 'verified' : 'warning_magic',
            first16Hex: Array.from(first16Bytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
            isEssential: this.ESSENTIAL_FILES.has(filename.toLowerCase())
        };

        await this.upsertMeta(meta);
        return meta;
    }

    async handleLocalizationAliases(filename, fileOrBlob) {
        const lower = filename.toLowerCase();
        let aliasName = null;

        if (lower === 'brazilianzh.big') aliasName = 'EnglishZH.big';
        else if (lower === 'brazilian.big') aliasName = 'English.big';
        else if (lower === 'speechbrazilianzh.big') aliasName = 'SpeechEnglishZH.big';
        else if (lower === 'speechbrazilian.big') aliasName = 'SpeechEnglish.big';
        else if (lower === 'audiobrazilianzh.big') aliasName = 'AudioEnglishZH.big';
        else if (lower === 'audiobrazilian.big') aliasName = 'AudioEnglish.big';
        else if (lower === 'w3dbrazilianzh.big') aliasName = 'W3DEnglishZH.big';

        if (aliasName) {
            try {
                const aliasHandle = await this.assetsDir.getFileHandle(aliasName, { create: true });
                const writable = await aliasHandle.createWritable();

                // If English counterpart of Brazilian archive, rewrite BIG directory entries to Data\English\...
                if ((aliasName === 'EnglishZH.big' || aliasName === 'English.big') && window.CaptalvoAssetBridge) {
                    const buf = await fileOrBlob.arrayBuffer();
                    const transformed = window.CaptalvoAssetBridge.transformToEnglishBig(new Uint8Array(buf));
                    if (transformed) {
                        await writable.write(transformed);
                        await writable.close();
                        console.log(`[CaptalvoAssetManager] Alias English com cabeçalhos sintetizados criado com sucesso em OPFS: ${aliasName}`);
                        return;
                    }
                }

                await fileOrBlob.stream().pipeTo(writable);
                console.log(`[CaptalvoAssetManager] Alias criado com sucesso: ${filename} -> ${aliasName}`);
            } catch (e) {
                console.warn(`[CaptalvoAssetManager] Falha ao criar alias para ${aliasName}:`, e);
            }
        }
    }

    async repairEnglishArchives() {
        if (!this.assetsDir) return;
        try {
            const pairs = [
                { src: 'brazilianzh.big', dst: 'EnglishZH.big' },
                { src: 'brazilian.big', dst: 'English.big' }
            ];

            for (const pair of pairs) {
                let srcHandle = null;
                try { srcHandle = await this.assetsDir.getFileHandle(pair.src); } catch (e) {}
                if (!srcHandle) {
                    try { srcHandle = await this.assetsDir.getFileHandle(pair.src.toUpperCase()); } catch (e) {}
                }
                if (!srcHandle) {
                    try {
                        for await (const [name, handle] of this.assetsDir.entries()) {
                            if (name.toLowerCase() === pair.src) {
                                srcHandle = handle;
                                break;
                            }
                        }
                    } catch (e) {}
                }
                if (!srcHandle) continue;

                let needsTransform = true;
                try {
                    const dstHandle = await this.assetsDir.getFileHandle(pair.dst);
                    const dstFile = await dstHandle.getFile();
                    const headBuf = await dstFile.slice(0, 4096).arrayBuffer();
                    const headStr = new TextDecoder('ascii').decode(headBuf);
                    if (headStr.includes('Data\\English\\') || headStr.includes('data\\english\\')) {
                        needsTransform = false;
                    }
                } catch (e) {
                    needsTransform = true;
                }

                if (needsTransform && window.CaptalvoAssetBridge) {
                    console.log(`[CaptalvoAssetManager] Auto-reparando e sintetizando ${pair.dst} em OPFS...`);
                    const srcFile = await srcHandle.getFile();
                    const srcBuf = await srcFile.arrayBuffer();
                    const transformed = window.CaptalvoAssetBridge.transformToEnglishBig(new Uint8Array(srcBuf));
                    if (transformed) {
                        const dstHandle = await this.assetsDir.getFileHandle(pair.dst, { create: true });
                        const writable = await dstHandle.createWritable();
                        await writable.write(transformed);
                        await writable.close();
                        console.log(`[CaptalvoAssetManager] ${pair.dst} reparado e gravado com sucesso no OPFS.`);
                    }
                }
            }
        } catch (err) {
            console.warn('[CaptalvoAssetManager] Aviso ao verificar/reparar arquivos de localização:', err);
        }
    }

    async computeSha256(blobOrFile) {
        try {
            // For files under 64 MB, hash full buffer
            if (blobOrFile.size <= 64 * 1024 * 1024) {
                const buffer = await blobOrFile.arrayBuffer();
                const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
                return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            // For massive archives (e.g. 300 MB), hash first 16 MB + size to be fast
            const head = await blobOrFile.slice(0, 16 * 1024 * 1024).arrayBuffer();
            const hashBuf = await crypto.subtle.digest('SHA-256', head);
            return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('') + `_len${blobOrFile.size}`;
        } catch (e) {
            return 'hash_unavailable';
        }
    }

    async upsertMeta(meta) {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction('assets_meta', 'readwrite');
            const store = tx.objectStore('assets_meta');
            store.put(meta);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    }

    async getMeta(name) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db.transaction('assets_meta', 'readonly');
            const store = tx.objectStore('assets_meta');
            const req = store.get(name);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async listAllMeta() {
        if (!this.db) return [];
        return new Promise((resolve) => {
            const tx = this.db.transaction('assets_meta', 'readonly');
            const store = tx.objectStore('assets_meta');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async deleteAsset(name) {
        // 1. Delete from OPFS
        if (this.assetsDir) {
            try {
                await this.assetsDir.removeEntry(name);
            } catch (e) {
                console.warn(`[CaptalvoAssetManager] removeEntry falhou para ${name}:`, e);
            }
        }

        // 2. Delete from IndexedDB
        if (this.db) {
            return new Promise((resolve) => {
                const tx = this.db.transaction('assets_meta', 'readwrite');
                tx.objectStore('assets_meta').delete(name);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        }
        return true;
    }

    async deleteAllAssets() {
        if (this.assetsDir) {
            try {
                for await (const [name, handle] of this.assetsDir.entries()) {
                    await this.assetsDir.removeEntry(name, { recursive: handle.kind === 'directory' });
                }
            } catch (e) {
                console.warn('[CaptalvoAssetManager] Erro limpando OPFS:', e);
            }
        }

        if (this.db) {
            return new Promise((resolve) => {
                const tx = this.db.transaction('assets_meta', 'readwrite');
                tx.objectStore('assets_meta').clear();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        }
        return true;
    }

    async exportAsset(filename) {
        if (!this.assetsDir) return false;
        try {
            const handle = await this.assetsDir.getFileHandle(filename);
            const file = await handle.getFile();
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
            return true;
        } catch (e) {
            console.error('[CaptalvoAssetManager] Falha ao exportar:', e);
            alert('Falha ao exportar arquivo: ' + e.message);
            return false;
        }
    }

    async syncCatalogWithOPFS() {
        if (!this.assetsDir) return [];
        const foundInOPFS = new Map();

        try {
            for await (const [name, handle] of this.assetsDir.entries()) {
                if (handle.kind === 'file' && name.toLowerCase().endsWith('.big')) {
                    const file = await handle.getFile();
                    foundInOPFS.set(name, file);
                }
            }
        } catch (e) {
            console.warn('[CaptalvoAssetManager] Falha listando OPFS:', e);
            return [];
        }

        const metas = await this.listAllMeta();
        const metaMap = new Map(metas.map(m => [m.name, m]));

        // Add missing files to catalog
        for (const [name, file] of foundInOPFS.entries()) {
            if (!metaMap.has(name)) {
                const first16Buffer = await file.slice(0, 16).arrayBuffer();
                const first16Bytes = new Uint8Array(first16Buffer);
                const magic = String.fromCharCode(...first16Bytes.subarray(0, 4));
                const isValidMagic = (magic === 'BIGF' || magic === 'BIG4');

                const meta = {
                    name,
                    canonicalName: name.toLowerCase(),
                    size: file.size,
                    sha256: `opfs_${file.size}`,
                    magic,
                    isValidMagic,
                    importedAt: new Date(file.lastModified).toISOString(),
                    version: 1,
                    status: isValidMagic ? 'verified' : 'unknown',
                    first16Hex: Array.from(first16Bytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
                    isEssential: this.ESSENTIAL_FILES.has(name.toLowerCase())
                };
                await this.upsertMeta(meta);
            }
        }

        // Remove deleted files from catalog
        for (const meta of metas) {
            if (!foundInOPFS.has(meta.name)) {
                await this.deleteAsset(meta.name);
            }
        }

        return await this.listAllMeta();
    }

    async getFileHandle(filename) {
        if (!this.assetsDir) await this.initOPFS();
        if (!this.assetsDir) return null;

        const lower = filename.toLowerCase();
        const candidates = [filename, lower];

        if (this.ALIAS_MAP[lower]) {
            candidates.push(...this.ALIAS_MAP[lower]);
        }

        for (const candidate of candidates) {
            try {
                const handle = await this.assetsDir.getFileHandle(candidate);
                if (handle) return handle;
            } catch (e) {}
        }

        // Case-insensitive fallback
        try {
            for await (const [storedName, handle] of this.assetsDir.entries()) {
                if (storedName.toLowerCase() === lower) {
                    return handle;
                }
            }
        } catch (e) {}

        return null;
    }

    async readFileSlice(filename, start, end) {
        const handle = await this.getFileHandle(filename);
        if (!handle) return null;
        const file = await handle.getFile();
        const slice = file.slice(start, end + 1);
        return new Uint8Array(await slice.arrayBuffer());
    }

    async readFileBuffer(filename) {
        const handle = await this.getFileHandle(filename);
        if (!handle) return null;
        const file = await handle.getFile();
        return await file.arrayBuffer();
    }
}

// Global Singleton & CommonJS Export
if (typeof window !== 'undefined') {
    window.CaptalvoAssetManager = new CaptalvoAssetManager();
}
if (typeof module !== 'undefined') {
    module.exports = CaptalvoAssetManager;
}

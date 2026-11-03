// ==============================================================================
// CAPTALVO - Service Worker
// 1. Cross-Origin Isolation (COOP/COEP)
// 2. OPFS Local Game Assets Interceptor (HTTP Range Requests for .big archives)
// ==============================================================================

const SW_VERSION = 'captalvo-v1.0.2';
const CACHE_NAME = `captalvo-cache-${SW_VERSION}`;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
            )
        ])
    );
});

// Localization aliases for Brazilian Portuguese EA App install
const ALIAS_MAP = {
    'englishzh.big': ['BrazilianZH.big', 'brazilianzh.big', 'EnglishZH.big', 'englishzh.big'],
    'english.big': ['Brazilian.big', 'brazilian.big', 'English.big', 'english.big'],
    'speechenglishzh.big': ['SpeechBrazilianZH.big', 'speechbrazilianzh.big', 'SpeechZH.big', 'SpeechEnglishZH.big'],
    'speechenglish.big': ['SpeechBrazilian.big', 'speechbrazilian.big', 'Speech.big', 'SpeechEnglish.big'],
    'audioenglishzh.big': ['AudioBrazilianZH.big', 'audiobrazilianzh.big', 'AudioZH.big', 'AudioEnglishZH.big'],
    'audioenglish.big': ['AudioBrazilian.big', 'audiobrazilian.big', 'Audio.big', 'AudioEnglish.big'],
    'w3denglishzh.big': ['W3DBrazilianZH.big', 'w3dbrazilianzh.big', 'W3DEnglishZH.big'],
};

// Helper: Read slice from an OPFS File
async function getOpfsFileSlice(filename, rangeHeader) {
    if (!navigator.storage || !navigator.storage.getDirectory) {
        return null;
    }

    try {
        const root = await navigator.storage.getDirectory();
        let assetsDir;
        try {
            assetsDir = await root.getDirectoryHandle('assets');
        } catch {
            return null; // 'assets' directory not created yet
        }

        const nameLower = filename.toLowerCase();
        const candidates = [filename, nameLower];

        if (ALIAS_MAP[nameLower]) {
            candidates.push(...ALIAS_MAP[nameLower]);
        }

        let fileHandle = null;
        for (const candidate of candidates) {
            try {
                fileHandle = await assetsDir.getFileHandle(candidate);
                if (fileHandle) break;
            } catch {
                // Keep trying
            }
        }

        // Case-insensitive fallback scan if direct handle failed
        if (!fileHandle) {
            try {
                for await (const [storedName, handle] of assetsDir.entries()) {
                    if (storedName.toLowerCase() === nameLower) {
                        fileHandle = handle;
                        break;
                    }
                }
            } catch {}
        }

        if (!fileHandle) {
            return null;
        }

        const file = await fileHandle.getFile();
        const totalSize = file.size;

        if (!rangeHeader) {
            return new Response(file, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(totalSize),
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Cross-Origin-Resource-Policy': 'cross-origin'
                }
            });
        }

        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
            return new Response('Invalid Range Header', { status: 416 });
        }

        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize || start > end) {
            return new Response('Requested range not satisfiable', {
                status: 416,
                headers: { 'Content-Range': `bytes */${totalSize}` }
            });
        }

        const slice = file.slice(start, end + 1);
        const contentLength = end - start + 1;

        return new Response(slice, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Content-Length': String(contentLength),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Cross-Origin-Resource-Policy': 'cross-origin'
            }
        });
    } catch (err) {
        console.error('[Captalvo SW] Error reading OPFS slice for', filename, err);
        return null;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Intercept .big game archives to serve locally from OPFS
    if (url.pathname.includes('/assets/') && url.pathname.toLowerCase().endsWith('.big')) {
        const parts = url.pathname.split('/');
        const filename = parts[parts.length - 1];
        const rangeHeader = request.headers.get('range');

        event.respondWith(
            (async () => {
                const opfsResponse = await getOpfsFileSlice(filename, rangeHeader);
                if (opfsResponse) {
                    return opfsResponse;
                }
                // Fallback to network fetch if not in OPFS
                return fetch(request).catch(() => {
                    return new Response(
                        JSON.stringify({
                            error: 'Asset not found in OPFS',
                            file: filename,
                            instruction: 'Importe sua pasta de jogo em captalvo.online'
                        }),
                        {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                });
            })()
        );
        return;
    }

    // 2. Cross-Origin Isolation injection for document requests
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then((response) => {
                if (response.status === 0) return response;
                const newHeaders = new Headers(response.headers);
                newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
                newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders
                });
            }).catch(() => fetch(request))
        );
    }
});

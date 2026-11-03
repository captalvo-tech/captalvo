/**
 * Captalvo Local Development & Range Test Server
 * Serves static files with full HTTP Range Request support for .big files
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.big': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';

    // Mock API health for local dev
    if (reqPath === '/api/health') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
            status: 'ok',
            service: 'Captalvo Core API (Local Dev)',
            version: '0.1.0-alpha',
            php_version: '8.3-mock',
            engine: 'Command & Conquer: Generals Zero Hour (WASM)',
            timestamp: new Date().toISOString()
        }));
    }

    const filePath = path.join(PUBLIC_DIR, reqPath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const totalSize = stats.size;

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Content-Type': contentType,
        };

        const range = req.headers.range;
        if (range) {
            const match = range.match(/bytes=(\d+)-(\d*)/);
            if (!match) {
                res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                return res.end();
            }

            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

            if (start >= totalSize || end >= totalSize || start > end) {
                res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                return res.end();
            }

            headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
            headers['Content-Length'] = end - start + 1;

            res.writeHead(206, headers);
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            headers['Content-Length'] = totalSize;
            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(res);
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Captalvo Dev] Servidor rodando em http://127.0.0.1:${PORT}`);
    console.log(`[Captalvo Dev] Diretório público: ${PUBLIC_DIR}`);
});

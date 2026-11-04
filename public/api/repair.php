<?php
declare(strict_types=1);

// ==============================================================================
// CAPTALVO — PROJECT SCORPION CLOUD REPAIR & STREAMING API
// Allows verification, range streaming, and downloading of Zero Hour and
// Generals base archives stored above public_html.
// ==============================================================================

// Absolute Anti-Cache & Cross-Origin Security Headers
if (!headers_sent()) {
    !headers_sent() && header('Cross-Origin-Resource-Policy: cross-origin');
    !headers_sent() && header('Cross-Origin-Opener-Policy: same-origin');
    !headers_sent() && header('Cross-Origin-Embedder-Policy: require-corp');
    !headers_sent() && header('Access-Control-Allow-Origin: *');
    !headers_sent() && header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
    !headers_sent() && header('Access-Control-Allow-Headers: Content-Type, Range, Authorization, X-Requested-With');
    !headers_sent() && header('Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges');
    !headers_sent() && header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    !headers_sent() && header('Pragma: no-cache');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit(0);
}

// Server directories for archives (strictly above public_html)
$serverPaths = [
    'GeneralsZH' => [
        '/home/u415074840/domains/captalvo.online/Zero-Hour-Files/Command_and_Conquer_Generals_Zero_Hour',
        __DIR__ . '/../../Zero-Hour-Files/Command_and_Conquer_Generals_Zero_Hour',
    ],
    'Generals' => [
        '/home/u415074840/domains/captalvo.online/Zero-Hour-Files/Command_and_Conquer_Generals',
        '/home/u415074840/domains/captalvo.online/Zero-Hour-Files/Command_and_Conquer_Generals_Zero_Hour/ZH_Generals',
        __DIR__ . '/../../Zero-Hour-Files/Command_and_Conquer_Generals',
    ]
];

// Reference catalog with official metadata and known file sizes
$knownArchives = [
    'GeneralsZH' => [
        ['name' => 'INIZH.big', 'size' => 18764687, 'category' => 'Configuração & Balanceamento', 'required' => true],
        ['name' => 'MapsZH.big', 'size' => 39749312, 'category' => 'Mapas Zero Hour', 'required' => true],
        ['name' => 'TexturesZH.big', 'size' => 222753036, 'category' => 'Texturas HD', 'required' => true],
        ['name' => 'W3DZH.big', 'size' => 189741064, 'category' => 'Modelos 3D', 'required' => true],
        ['name' => 'WindowZH.big', 'size' => 8493653, 'category' => 'Interface Gráfica (HUD/UI)', 'required' => true],
        ['name' => 'TerrainZH.big', 'size' => 8660432, 'category' => 'Terrenos & Relevo', 'required' => true],
        ['name' => 'gensecZH.big', 'size' => 787464, 'category' => 'Segurança & Parâmetros', 'required' => true],
        ['name' => 'MusicZH.big', 'size' => 34741916, 'category' => 'Trilha Sonora Zero Hour', 'required' => true],
        ['name' => 'PatchZH.big', 'size' => 118822, 'category' => 'Patch Zero Hour', 'required' => true],
        ['name' => 'PatchData.big', 'size' => 127, 'category' => 'Patch Data', 'required' => false],
        ['name' => 'PatchINI.big', 'size' => 53717, 'category' => 'Patch INI', 'required' => false],
        ['name' => 'PatchWindow.big', 'size' => 260789, 'category' => 'Patch Window UI', 'required' => false],
        ['name' => 'ShadersZH.big', 'size' => 996, 'category' => 'Shaders Gráficos', 'required' => false],
        ['name' => 'AudioZH.big', 'size' => 23965542, 'category' => 'Áudio & Efeitos', 'required' => false],
        ['name' => 'AudioBrazilianZH.big', 'size' => 58328110, 'category' => 'Áudio Dublado (PT-BR)', 'required' => false],
        ['name' => 'BrazilianZH.big', 'size' => 79448196, 'category' => 'Localização Português', 'required' => false],
        ['name' => 'SpeechZH.big', 'size' => 6174552, 'category' => 'Vozes das Tropas', 'required' => false],
        ['name' => 'SpeechBrazilianZH.big', 'size' => 254280554, 'category' => 'Vozes Dubladas (PT-BR)', 'required' => false],
        ['name' => 'W3DBrazilianZH.big', 'size' => 124372, 'category' => 'Modelos Locais (PT-BR)', 'required' => false],
    ],
    'Generals' => [
        ['name' => 'INI.big', 'size' => 7607479, 'category' => 'Motor Base & Regras', 'required' => true],
        ['name' => 'maps.big', 'size' => 23554152, 'category' => 'Mapas Originais', 'required' => true],
        ['name' => 'Textures.big', 'size' => 333031108, 'category' => 'Texturas Base', 'required' => true],
        ['name' => 'W3D.big', 'size' => 184549391, 'category' => 'Modelos 3D Base', 'required' => true],
        ['name' => 'Window.big', 'size' => 7962700, 'category' => 'Interface Base', 'required' => true],
        ['name' => 'Terrain.big', 'size' => 48342856, 'category' => 'Terrenos Base', 'required' => true],
        ['name' => 'gensec.big', 'size' => 787464, 'category' => 'Segurança Base', 'required' => true],
        ['name' => 'Music.big', 'size' => 158818808, 'category' => 'Trilha Sonora Base', 'required' => true],
        ['name' => 'Audio.big', 'size' => 127940044, 'category' => 'Áudio Base', 'required' => false],
        ['name' => 'AudioBrazilian.big', 'size' => 104747996, 'category' => 'Áudio Dublado Base (PT-BR)', 'required' => false],
        ['name' => 'Brazilian.big', 'size' => 2785360, 'category' => 'Textos PT-BR Base', 'required' => false],
        ['name' => 'Speech.big', 'size' => 13479230, 'category' => 'Vozes Base', 'required' => false],
        ['name' => 'SpeechBrazilian.big', 'size' => 269107152, 'category' => 'Vozes Dubladas Base (PT-BR)', 'required' => false],
        ['name' => 'Patch.big', 'size' => 1462590, 'category' => 'Patch Base', 'required' => false],
        ['name' => 'PatchData.big', 'size' => 127, 'category' => 'Patch Data Base', 'required' => false],
        ['name' => 'PatchINI.big', 'size' => 53348, 'category' => 'Patch INI Base', 'required' => false],
        ['name' => 'PatchWindow.big', 'size' => 261069, 'category' => 'Patch Window Base', 'required' => false],
        ['name' => 'shaders.big', 'size' => 1200, 'category' => 'Shaders Base', 'required' => false],
    ]
];

/**
 * Resolves physical file on disk based on mount and filename.
 */
function resolveDiskPath(string $mount, string $fileName, array $serverPaths): ?string {
    $cleanMount = ($mount === 'Generals' || $mount === 'generals' || $mount === '/Generals') ? 'Generals' : 'GeneralsZH';
    $safeName = basename($fileName);
    if (!preg_match('/^[a-zA-Z0-9_\-\.]+\.big$/i', $safeName)) {
        return null;
    }

    $candidates = $serverPaths[$cleanMount] ?? [];
    foreach ($candidates as $dir) {
        if (!is_dir($dir)) continue;
        $file = $dir . '/' . $safeName;
        if (file_exists($file) && is_readable($file)) {
            return $file;
        }
        // Case-insensitive search on linux if needed
        $scanned = @scandir($dir);
        if ($scanned) {
            foreach ($scanned as $item) {
                if (strcasecmp($item, $safeName) === 0) {
                    $match = $dir . '/' . $item;
                    if (file_exists($match) && is_readable($match)) {
                        return $match;
                    }
                }
            }
        }
    }
    return null;
}

$action = $_GET['action'] ?? 'catalog';

// ACTION: CATALOG
if ($action === 'catalog') {
    !headers_sent() && header('Content-Type: application/json; charset=UTF-8');
    $catalog = [
        'status' => 'ok',
        'engine' => 'Scorpion',
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
        'total_available' => 0,
        'archives' => [
            'GeneralsZH' => [],
            'Generals' => []
        ]
    ];

    foreach ($knownArchives as $mount => $files) {
        foreach ($files as $info) {
            $realPath = resolveDiskPath($mount, $info['name'], $serverPaths);
            $realSize = $realPath ? filesize($realPath) : $info['size'];
            $availableOnServer = $realPath !== null;

            $entry = [
                'name' => $info['name'],
                'mount' => $mount,
                'category' => $info['category'],
                'required' => $info['required'],
                'size' => $realSize,
                'available' => $availableOnServer,
                'stream_url' => "/api/repair.php?action=stream&mount={$mount}&file=" . urlencode($info['name']),
                'download_url' => "/api/repair.php?action=download&mount={$mount}&file=" . urlencode($info['name'])
            ];

            if ($availableOnServer) {
                $catalog['total_available']++;
            }
            $catalog['archives'][$mount][] = $entry;
        }
    }

    echo json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit(0);
}

// ACTION: VERIFY LOCAL FILES AGAINST SERVER
if ($action === 'verify') {
    !headers_sent() && header('Content-Type: application/json; charset=UTF-8');
    $rawInput = file_get_contents('php://input');
    $clientFiles = [];
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $clientFiles = $decoded;
        }
    }

    $results = [
        'status' => 'ok',
        'healthy' => [],
        'divergent' => [],
        'missing' => [],
        'can_auto_stream' => true
    ];

    foreach ($knownArchives as $mount => $files) {
        foreach ($files as $info) {
            $nameLower = strtolower($info['name']);
            $realPath = resolveDiskPath($mount, $info['name'], $serverPaths);
            $expectedSize = $realPath ? filesize($realPath) : $info['size'];

            $clientEntry = null;
            foreach ($clientFiles as $cf) {
                if (strtolower($cf['name'] ?? '') === $nameLower) {
                    $clientEntry = $cf;
                    break;
                }
            }

            if (!$clientEntry) {
                $results['missing'][] = [
                    'name' => $info['name'],
                    'mount' => $mount,
                    'required' => $info['required'],
                    'expected_size' => $expectedSize,
                    'stream_url' => "/api/repair.php?action=stream&mount={$mount}&file=" . urlencode($info['name']),
                    'download_url' => "/api/repair.php?action=download&mount={$mount}&file=" . urlencode($info['name'])
                ];
            } else {
                $localSize = (int)($clientEntry['size'] ?? 0);
                // Allow minor delta for community patches if size > 0
                $sizeDiff = abs($localSize - $expectedSize);
                if ($localSize > 0 && ($sizeDiff === 0 || ($sizeDiff / max(1, $expectedSize)) < 0.05)) {
                    $results['healthy'][] = [
                        'name' => $info['name'],
                        'mount' => $mount,
                        'local_size' => $localSize,
                        'expected_size' => $expectedSize
                    ];
                } else {
                    $results['divergent'][] = [
                        'name' => $info['name'],
                        'mount' => $mount,
                        'local_size' => $localSize,
                        'expected_size' => $expectedSize,
                        'stream_url' => "/api/repair.php?action=stream&mount={$mount}&file=" . urlencode($info['name']),
                        'download_url' => "/api/repair.php?action=download&mount={$mount}&file=" . urlencode($info['name'])
                    ];
                }
            }
        }
    }

    echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit(0);
}

// ACTION: STREAM (HTTP Range 206 for Web Worker ArchiveStreamer)
if ($action === 'stream' || $action === 'download') {
    $mount = $_GET['mount'] ?? 'GeneralsZH';
    $file = $_GET['file'] ?? '';

    $physical = resolveDiskPath($mount, $file, $serverPaths);
    if (!$physical || !is_file($physical)) {
        http_response_code(404);
        !headers_sent() && header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'File not found on server', 'file' => basename($file), 'mount' => $mount]);
        exit(0);
    }

    $fileSize = filesize($physical);
    $safeName = basename($physical);

    // Turn off output buffering for raw high-speed binary streaming
    while (ob_get_level()) {
        ob_end_clean();
    }

    if ($action === 'download') {
        !headers_sent() && header('Content-Type: application/octet-stream');
        !headers_sent() && header('Content-Disposition: attachment; filename="' . $safeName . '"');
        !headers_sent() && header('Content-Length: ' . $fileSize);
        !headers_sent() && header('Accept-Ranges: bytes');
        readfile($physical);
        exit(0);
    }

    // Range Streaming for ArchiveStreamer
    $start = 0;
    $end = $fileSize - 1;

    if (isset($_SERVER['HTTP_RANGE'])) {
        if (preg_match('/bytes=\s*(\d+)-(\d*)/i', $_SERVER['HTTP_RANGE'], $matches)) {
            $start = (int)$matches[1];
            if (!empty($matches[2])) {
                $end = (int)$matches[2];
            }
        }
        if ($start > $end || $start >= $fileSize) {
            http_response_code(416); // Range Not Satisfiable
            !headers_sent() && header("Content-Range: bytes */{$fileSize}");
            exit(0);
        }
        $end = min($end, $fileSize - 1);
        $length = ($end - $start) + 1;
        http_response_code(206);
        !headers_sent() && header("Content-Range: bytes {$start}-{$end}/{$fileSize}");
    } else {
        $length = $fileSize;
        http_response_code(200);
    }

    !headers_sent() && header('Content-Type: application/octet-stream');
    !headers_sent() && header("Content-Length: {$length}");
    !headers_sent() && header('Accept-Ranges: bytes');

    $fp = fopen($physical, 'rb');
    if ($fp === false) {
        http_response_code(500);
        exit(0);
    }

    fseek($fp, $start);
    $remaining = $length;
    $chunkSize = 65536; // 64KB buffer
    while ($remaining > 0 && !feof($fp)) {
        $read = ($remaining > $chunkSize) ? $chunkSize : $remaining;
        $buffer = fread($fp, $read);
        if ($buffer === false) break;
        echo $buffer;
        flush();
        $remaining -= strlen($buffer);
    }
    fclose($fp);
    exit(0);
}

// Default fallback
http_response_code(400);
!headers_sent() && header('Content-Type: application/json; charset=UTF-8');
echo json_encode(['error' => 'Invalid action parameter']);

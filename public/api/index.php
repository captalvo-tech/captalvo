<?php
declare(strict_types=1);

// Captalvo API Front Controller
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
header('Pragma: no-cache');
header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit(0);
}

// Load Bootstrap
$bootstrapFile = __DIR__ . '/../../app/Bootstrap.php';
if (!file_exists($bootstrapFile)) {
    $bootstrapFile = __DIR__ . '/../app/Bootstrap.php';
}

if (file_exists($bootstrapFile)) {
    require_once $bootstrapFile;
    Captalvo\Bootstrap::init();
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$path = rtrim($uri, '/');
$endpointParam = $_GET['endpoint'] ?? '';

// Origami WebGPU Helper Endpoints
if ($endpointParam === 'GeneralsXAssets' || str_ends_with($path, 'GeneralsXAssets')) {
    echo json_encode([
        'missing' => true,
        'entries' => []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit(0);
}

if ($endpointParam === 'GeneralsXLog' || str_ends_with($path, 'GeneralsXLog')) {
    $raw = file_get_contents('php://input');
    $logDir = dirname(__DIR__, 2) . '/app/storage/logs';
    if (!is_dir($logDir)) {
        $logDir = dirname(__DIR__) . '/app/storage/logs';
    }
    if (is_dir($logDir) || @mkdir($logDir, 0775, true)) {
        $entry = sprintf("[%s] [OrigamiEngine] %s\n", gmdate('Y-m-d\TH:i:s\Z'), trim($raw));
        @file_put_contents($logDir . '/origami.log', $entry, FILE_APPEND | LOCK_EX);
    }
    echo json_encode(['status' => 'ok'], JSON_PRETTY_PRINT);
    exit(0);
}

if ($endpointParam === 'GeneralsXShare' || str_ends_with($path, 'GeneralsXShare')) {
    echo json_encode(['url' => ''], JSON_PRETTY_PRINT);
    exit(0);
}

if ($path === '/api/health' || $path === '/api/health.php' || str_ends_with($path, 'health')) {
    if (class_exists('Captalvo\\Controllers\\HealthController')) {
        $controller = new Captalvo\Controllers\HealthController();
        echo json_encode($controller->check(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } else {
        echo json_encode([
            'status' => 'ok',
            'service' => 'Captalvo Core API',
            'version' => '0.2.0-alpha',
            'php_version' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'engines' => [
                'webgl2' => 'Command & Conquer: Generals Zero Hour (SAGE WASM)',
                'webgpu' => 'GeneralsX WebGPU (Origami wasm-generals)'
            ],
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'uptime' => 'online',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
    exit(0);
}

// Telemetry & Remote Logging Ingestion
if ($path === '/api/telemetry' || $path === '/api/logs' || str_ends_with($path, 'telemetry') || str_ends_with($path, 'logs')) {
    if (class_exists('Captalvo\\Controllers\\TelemetryController')) {
        $controller = new Captalvo\Controllers\TelemetryController();
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            echo json_encode($controller->ingest(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        } else {
            // GET returns aggregated stats or recent telemetry entries
            if (isset($_GET['action']) && $_GET['action'] === 'stats') {
                echo json_encode($controller->getStats(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            } else {
                echo json_encode($controller->getRecent(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            }
        }
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'TelemetryController not loaded']);
    }
    exit(0);
}

// Default API endpoint response
echo json_encode([
    'name' => 'Captalvo API',
    'slogan' => 'Conquista sem limites.',
    'status' => 'online',
    'endpoints' => [
        '/api/health' => 'System health status and telemetry',
        '/api/telemetry' => 'Automated client telemetry & remote log ingestion (POST/GET)',
        '/webgl2/' => 'Current WebGL 2.0 Engine',
        '/webgpu/' => 'Origami WebGPU Engine'
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

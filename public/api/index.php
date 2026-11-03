<?php
declare(strict_types=1);

// Captalvo API Front Controller
header('Content-Type: application/json; charset=UTF-8');
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
    // Fallback if app is in public_html/app or sibling
    $bootstrapFile = __DIR__ . '/../app/Bootstrap.php';
}

if (file_exists($bootstrapFile)) {
    require_once $bootstrapFile;
    Captalvo\Bootstrap::init();
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$path = rtrim($uri, '/');

if ($path === '/api/health' || $path === '/api/health.php' || str_ends_with($path, 'health')) {
    if (class_exists('Captalvo\\Controllers\\HealthController')) {
        $controller = new Captalvo\Controllers\HealthController();
        echo json_encode($controller->check(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } else {
        echo json_encode([
            'status' => 'ok',
            'service' => 'Captalvo Core API',
            'version' => '0.1.0-alpha',
            'php_version' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'engine' => 'Command & Conquer: Generals Zero Hour (WASM)',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'uptime' => 'online',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
    exit(0);
}

// Default API endpoint response
echo json_encode([
    'name' => 'Captalvo API',
    'slogan' => 'Conquista sem limites.',
    'status' => 'online',
    'endpoints' => [
        '/api/health' => 'System health status and telemetry'
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

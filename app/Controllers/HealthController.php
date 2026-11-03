<?php
declare(strict_types=1);

namespace Captalvo\Controllers;

class HealthController
{
    public function check(): array
    {
        return [
            'status' => 'ok',
            'service' => 'Captalvo Core API',
            'version' => '0.1.0-alpha',
            'php_version' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'engine' => 'Command & Conquer: Generals Zero Hour (WASM)',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'uptime' => 'online',
        ];
    }
}

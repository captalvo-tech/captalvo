<?php
declare(strict_types=1);

return [
    'name' => 'Captalvo',
    'slogan' => 'Conquista sem limites.',
    'description' => 'Simulador de Guerra Global Virtual',
    'version' => '0.1.0-alpha',
    'environment' => 'production',
    'api_prefix' => '/api',
    'cors' => [
        'allowed_origins' => ['https://captalvo.online'],
        'allowed_methods' => ['GET', 'POST', 'OPTIONS'],
        'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With'],
    ],
    'database' => [
        'driver' => 'mysql',
        'host' => 'localhost',
        'port' => 3306,
        'database' => 'captalvo_db',
        'username' => 'captalvo_user',
        'password' => '',
        'charset' => 'utf8mb4',
    ]
];

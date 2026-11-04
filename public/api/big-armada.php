<?php
declare(strict_types=1);

// ==============================================================================
// CAPTALVO — BIG ARMADA AUTHORITATIVE BACKEND API (PHP 8.3)
// Real-World Earth MMORTS Engine & State Authority
// Target: https://captalvo.online/api/big-armada.php
// ==============================================================================

// Absolute Anti-Cache & Cross-Origin Security Headers
if (!headers_sent()) {
    header('Content-Type: application/json; charset=UTF-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
    header('Pragma: no-cache');
    header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit(0);
}

// Storage path in persistent app directory above public_html
$storageDir = dirname(__DIR__, 2) . '/app/storage/big-armada';
if (!is_dir($storageDir)) {
    $storageDir = dirname(__DIR__) . '/app/storage/big-armada';
}
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0775, true);
}
$stateFile = $storageDir . '/world_state.json';

// SSE Stream Mode Check
$action = $_GET['action'] ?? ($_POST['action'] ?? '');
if ($action === 'events') {
    handleSSEStream($stateFile);
    exit(0);
}

// Helper: Haversine distance in meters
function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371000.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * (sin($dLon / 2) ** 2);
    return 2 * $R * asin(sqrt($a));
}

// Helper: Convert Lat/Lon to Local Cartesian Meters (Tangent at Uberaba reference)
function latLonToLocalMeters(float $lat, float $lon, float $refLat = -19.7472, float $refLon = -47.9392): array {
    $R = 6371000.0;
    $dLat = deg2rad($lat - $refLat);
    $dLon = deg2rad($lon - $refLon);
    $x = $dLon * $R * cos(deg2rad($refLat));
    $z = -$dLat * $R;
    return ['x' => $x, 'z' => $z];
}

// Helper: Load or Initialize World State
function loadWorldState(string $file): array {
    if (file_exists($file)) {
        $data = @file_get_contents($file);
        if ($data) {
            $parsed = @json_decode($data, true);
            if (is_array($parsed) && isset($parsed['installations'])) {
                return $parsed;
            }
        }
    }

    // Default Seed State: Sector Uberaba - MG
    return [
        'sector' => 'Uberaba, MG, Brazil',
        'center_lat' => -19.7472,
        'center_lon' => -47.9392,
        's2_token_level_13' => '10d0000000175833',
        'created_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'last_tick_time' => time(),
        'tick_interval_sec' => 2,
        'players' => [],
        'units' => [],
        'buildings' => [],
        'installations' => [
            'inst_uberaba_airport' => [
                'id' => 'inst_uberaba_airport',
                'name' => 'Aeroporto Mário de Almeida Franco (Uberaba - SBUR)',
                'category' => 'airport',
                'lat' => -19.7656,
                'lon' => -47.9658,
                'capture_radius_m' => 65.0,
                'controller' => null,
                'flag_color' => '#888888',
                'capture_progress' => 0.0,
                'is_contested' => false,
                'income_bonus_per_tick' => 60.0
            ],
            'inst_uberaba_power' => [
                'id' => 'inst_uberaba_power',
                'name' => 'Subestação de Energia Uberaba I',
                'category' => 'power',
                'lat' => -19.7350,
                'lon' => -47.9250,
                'capture_radius_m' => 50.0,
                'controller' => null,
                'flag_color' => '#888888',
                'capture_progress' => 0.0,
                'is_contested' => false,
                'income_bonus_per_tick' => 40.0
            ],
            'inst_uberaba_logistics' => [
                'id' => 'inst_uberaba_logistics',
                'name' => 'Terminal Intermodal Logístico (BR-050 / BR-262)',
                'category' => 'logistics',
                'lat' => -19.7550,
                'lon' => -47.9150,
                'capture_radius_m' => 55.0,
                'controller' => null,
                'flag_color' => '#888888',
                'capture_progress' => 0.0,
                'is_contested' => false,
                'income_bonus_per_tick' => 45.0
            ]
        ],
        'alliances' => []
    ];
}

// Helper: Save World State with Atomic File Lock
function saveWorldState(string $file, array $state): bool {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $state['saved_at'] = gmdate('Y-m-d\TH:i:s\Z');
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    $tmpFile = $file . '.tmp.' . uniqid();
    if (@file_put_contents($tmpFile, $json, LOCK_EX) !== false) {
        return @rename($tmpFile, $file);
    }
    return false;
}

// Helper: Run Simulation Tick (Economy, Anti-Blobbing, Captures, Movement)
function processSimulationTick(array &$state): array {
    $now = time();
    $lastTick = $state['last_tick_time'] ?? $now;
    $elapsed = $now - $lastTick;
    $tickEvents = ['deserted' => [], 'captures' => []];

    // If less than tick interval, only update positions
    if ($elapsed < 1) {
        return $tickEvents;
    }

    $state['last_tick_time'] = $now;

    // 1. Process Installation Income
    foreach ($state['installations'] as $instId => &$inst) {
        if (!empty($inst['controller']) && isset($state['players'][$inst['controller']])) {
            $state['players'][$inst['controller']]['treasury'] += ($inst['income_bonus_per_tick'] ?? 50.0);
        }
    }
    unset($inst);

    // 2. Process Base Buildings Income
    foreach ($state['buildings'] as $bId => &$b) {
        $ownerId = $b['owner'] ?? null;
        if ($ownerId && isset($state['players'][$ownerId])) {
            $state['players'][$ownerId]['treasury'] += ($b['income_per_tick'] ?? 10.0);
        }
    }
    unset($b);

    // 3. Process Military Economy & Anti-Blobbing
    $salaryTable = [
        'infantry_scout' => 15.0,
        'infantry_stealth' => 25.0,
        'vehicle_technical' => 45.0,
        'drone_recon' => 30.0
    ];

    foreach ($state['players'] as $pId => &$player) {
        $myUnits = array_filter($state['units'], fn($u) => ($u['owner'] ?? '') === $pId);
        $count = count($myUnits);
        if ($count === 0) continue;

        // Anti-Blobbing Scale: Upkeep = Base * (1 + (Count / 30)^1.35)
        $scale = 1.0 + pow($count / 30.0, 1.35);
        $totalUpkeep = 0.0;
        foreach ($myUnits as $u) {
            $base = $salaryTable[$u['type']] ?? 20.0;
            $totalUpkeep += $base * $scale;
        }

        $player['upkeep_last'] = round($totalUpkeep, 2);

        // Check solvency
        if ($player['treasury'] >= $totalUpkeep) {
            $player['treasury'] -= $totalUpkeep;
            $player['unpaid_ticks'] = 0;
            // Restore active status
            foreach ($myUnits as $uId => $u) {
                if ($state['units'][$uId]['contract_status'] === 'overdue') {
                    $state['units'][$uId]['contract_status'] = 'active';
                }
            }
        } else {
            // Default on payroll
            $player['treasury'] = max(0.0, $player['treasury'] - $totalUpkeep);
            $player['unpaid_ticks'] = ($player['unpaid_ticks'] ?? 0) + 1;

            foreach ($myUnits as $uId => $u) {
                if ($player['unpaid_ticks'] < 3) {
                    $state['units'][$uId]['contract_status'] = 'overdue';
                } else {
                    // DESERTION! Unit abandons commander and becomes Neutral Mercenary
                    $state['units'][$uId]['contract_status'] = 'deserted';
                    $state['units'][$uId]['owner'] = 'neutral_mercenary';
                    $state['units'][$uId]['color'] = '#e67e22'; // Orange mercenary color
                    $state['units'][$uId]['name'] = 'Mercenário Desertor (Ex-' . $player['name'] . ')';
                    $tickEvents['deserted'][] = [
                        'unit_id' => $uId,
                        'name' => $u['name'],
                        'previous_owner' => $pId
                    ];
                }
            }
        }
    }
    unset($player);

    // 4. Process Strategic Installation Captures
    foreach ($state['installations'] as $instId => &$inst) {
        $instLat = $inst['lat'];
        $instLon = $inst['lon'];
        $radius = $inst['capture_radius_m'];

        $unitsInRange = [];
        foreach ($state['units'] as $uId => $u) {
            if ($u['contract_status'] === 'active' && !empty($u['owner']) && $u['owner'] !== 'neutral_mercenary') {
                $dist = haversineMeters($instLat, $instLon, (float)$u['lat'], (float)$u['lon']);
                if ($dist <= $radius) {
                    $unitsInRange[] = $u;
                }
            }
        }

        if (empty($unitsInRange)) {
            $inst['is_contested'] = false;
            continue;
        }

        // Check if multiple owners are present (Contested)
        $owners = array_unique(array_map(fn($u) => $u['owner'], $unitsInRange));
        if (count($owners) > 1) {
            $inst['is_contested'] = true;
            continue;
        }

        $inst['is_contested'] = false;
        $capturingOwner = $owners[0];

        if ($inst['controller'] !== $capturingOwner) {
            $inst['capture_progress'] = min(100.0, ($inst['capture_progress'] ?? 0.0) + 20.0);
            if ($inst['capture_progress'] >= 100.0) {
                $inst['controller'] = $capturingOwner;
                $pColor = $state['players'][$capturingOwner]['color'] ?? '#00d9ff';
                $inst['flag_color'] = $pColor;
                $tickEvents['captures'][] = [
                    'installationId' => $instId,
                    'newOwner' => $capturingOwner,
                    'name' => $inst['name']
                ];
            }
        } else {
            $inst['capture_progress'] = 100.0;
        }
    }
    unset($inst);

    return $tickEvents;
}

// Parse Request Body
$rawInput = file_get_contents('php://input');
$inputData = [];
if (!empty($rawInput)) {
    $inputData = @json_decode($rawInput, true) ?? [];
}
$request = array_merge($_GET, $_POST, $inputData);
$action = $request['action'] ?? 'state';

// Load Current World State
$world = loadWorldState($stateFile);
$tickEvents = processSimulationTick($world);

// ==============================================================================
// ACTION DISPATCHER
// ==============================================================================

switch ($action) {
    case 'state':
        // Return full authoritative snapshot
        echo json_encode([
            'success' => true,
            'snapshot' => $world,
            'server_time' => gmdate('Y-m-d\TH:i:s\Z')
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        saveWorldState($stateFile, $world);
        break;

    case 'join':
        $playerId = $request['playerId'] ?? ('cmdr_' . substr(md5((string)uniqid('', true)), 0, 8));
        $playerName = $request['playerName'] ?? ('Comandante ' . strtoupper(substr($playerId, -4)));
        $color = $request['color'] ?? '#00d9ff';

        if (!isset($world['players'][$playerId])) {
            // Spawn point close to Uberaba base sector
            $spawnLat = -19.7485 + (mt_rand(-25, 25) / 10000.0);
            $spawnLon = -47.9390 + (mt_rand(-25, 25) / 10000.0);

            $world['players'][$playerId] = [
                'id' => $playerId,
                'name' => $playerName,
                'color' => $color,
                'treasury' => 2000.0,
                'spawn_lat' => $spawnLat,
                'spawn_lon' => $spawnLon,
                'unpaid_ticks' => 0,
                'joined_at' => gmdate('Y-m-d\TH:i:s\Z')
            ];

            // 1. Initial Headquarters Building (Centro de Comando)
            $bId = 'bld_hq_' . substr(md5($playerId . '_hq'), 0, 8);
            $world['buildings'][$bId] = [
                'id' => $bId,
                'owner' => $playerId,
                'type' => 'command_center',
                'name' => 'QG Clandestino',
                'lat' => $spawnLat,
                'lon' => $spawnLon,
                'health' => 500,
                'max_health' => 500,
                'income_per_tick' => 20.0,
                'built_at' => gmdate('Y-m-d\TH:i:s\Z')
            ];

            // 2. Initial Battle Tank (Tanque de Guerra Pesado)
            $uTankId = 'unit_tank_' . substr(md5($playerId . '_tank_1'), 0, 8);
            $world['units'][$uTankId] = [
                'id' => $uTankId,
                'owner' => $playerId,
                'name' => 'Tanque de Batalha Pesado',
                'type' => 'tank_battle',
                'lat' => $spawnLat - 0.0003,
                'lon' => $spawnLon + 0.0004,
                'speed_ms' => 3.8,
                'health' => 400,
                'max_health' => 400,
                'contract_status' => 'active',
                'is_moving' => false,
                'color' => $color
            ];

            // 3. Initial Scout Soldier (Infantaria)
            $uScoutId = 'unit_scout_' . substr(md5($playerId . '_scout_1'), 0, 8);
            $world['units'][$uScoutId] = [
                'id' => $uScoutId,
                'owner' => $playerId,
                'name' => 'Batedor Clandestino #1',
                'type' => 'infantry_scout',
                'lat' => $spawnLat + 0.0003,
                'lon' => $spawnLon - 0.0002,
                'speed_ms' => 4.5,
                'health' => 100,
                'max_health' => 100,
                'is_stealth' => true,
                'contract_status' => 'active',
                'is_moving' => false,
                'color' => $color
            ];
        }

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'player' => $world['players'][$playerId],
            'snapshot' => $world
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    case 'produce':
        $playerId = $request['playerId'] ?? '';
        $type = $request['type'] ?? 'tank_battle';

        $unitCatalog = [
            'tank_battle' => ['name' => 'Tanque de Batalha Pesado', 'cost' => 350.0, 'health' => 400, 'speed' => 3.8],
            'vehicle_technical' => ['name' => 'Blindado Técnico (DShK)', 'cost' => 150.0, 'health' => 200, 'speed' => 5.2],
            'infantry_stealth' => ['name' => 'Atirador Furtivo', 'cost' => 80.0, 'health' => 100, 'speed' => 4.0],
            'infantry_scout' => ['name' => 'Batedor Clandestino', 'cost' => 50.0, 'health' => 100, 'speed' => 4.5]
        ];

        $unitInfo = $unitCatalog[$type] ?? $unitCatalog['tank_battle'];

        if (!isset($world['players'][$playerId])) {
            http_response_code(400);
            echo json_encode(['error' => 'Jogador não encontrado']);
            exit(0);
        }

        if ($world['players'][$playerId]['treasury'] < $unitInfo['cost']) {
            http_response_code(400);
            echo json_encode(['error' => 'Fundos insuficientes para produzir']);
            exit(0);
        }

        $world['players'][$playerId]['treasury'] -= $unitInfo['cost'];
        $uId = 'unit_' . substr(md5(uniqid('', true)), 0, 8);

        // Spawn around player base
        $spawnLat = ($world['players'][$playerId]['spawn_lat'] ?? -19.7472) + (mt_rand(-30, 30) / 10000.0);
        $spawnLon = ($world['players'][$playerId]['spawn_lon'] ?? -47.9392) + (mt_rand(-30, 30) / 10000.0);

        $world['units'][$uId] = [
            'id' => $uId,
            'owner' => $playerId,
            'name' => $unitInfo['name'],
            'type' => $type,
            'lat' => $spawnLat,
            'lon' => $spawnLon,
            'speed_ms' => $unitInfo['speed'],
            'health' => $unitInfo['health'],
            'max_health' => $unitInfo['health'],
            'contract_status' => 'active',
            'is_moving' => false,
            'color' => $world['players'][$playerId]['color'] ?? '#00d9ff'
        ];

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'unit' => $world['units'][$uId],
            'treasury' => $world['players'][$playerId]['treasury'],
            'snapshot' => $world
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    case 'move':
        $unitIds = (array)($request['unitIds'] ?? []);
        $targetLat = (float)($request['targetLat'] ?? 0);
        $targetLon = (float)($request['targetLon'] ?? 0);
        $targetX = isset($request['targetX']) ? (float)$request['targetX'] : null;
        $targetZ = isset($request['targetZ']) ? (float)$request['targetZ'] : null;

        $updated = [];
        foreach ($unitIds as $uId) {
            if (isset($world['units'][$uId])) {
                $world['units'][$uId]['target_lat'] = $targetLat;
                $world['units'][$uId]['target_lon'] = $targetLon;
                if ($targetX !== null && $targetZ !== null) {
                    $world['units'][$uId]['target_x'] = $targetX;
                    $world['units'][$uId]['target_z'] = $targetZ;
                }
                $world['units'][$uId]['is_moving'] = true;
                $updated[] = $uId;
            }
        }

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'updatedUnits' => $updated,
            'target' => ['lat' => $targetLat, 'lon' => $targetLon]
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    case 'build':
        $playerId = $request['playerId'] ?? '';
        $type = $request['type'] ?? 'command_center';
        $lat = (float)($request['lat'] ?? -19.7472);
        $lon = (float)($request['lon'] ?? -47.9392);

        $costs = [
            'command_center' => 400.0,
            'war_factory' => 500.0,
            'barracks' => 200.0,
            'supply_stash' => 250.0,
            'power_plant' => 150.0,
            'defense_turret' => 200.0
        ];
        $cost = $costs[$type] ?? 300.0;

        if (!isset($world['players'][$playerId])) {
            http_response_code(400);
            echo json_encode(['error' => 'Jogador não encontrado']);
            exit(0);
        }

        if ($world['players'][$playerId]['treasury'] < $cost) {
            http_response_code(400);
            echo json_encode(['error' => 'Fundos insuficientes para construir']);
            exit(0);
        }

        $world['players'][$playerId]['treasury'] -= $cost;
        $bId = 'bld_' . substr(md5(uniqid('', true)), 0, 8);
        $incomePerTick = match($type) {
            'supply_stash' => 35.0,
            'power_plant' => 15.0,
            'command_center' => 20.0,
            default => 5.0
        };
        $world['buildings'][$bId] = [
            'id' => $bId,
            'owner' => $playerId,
            'type' => $type,
            'lat' => $lat,
            'lon' => $lon,
            'health' => ($type === 'command_center' || $type === 'war_factory') ? 500 : 350,
            'max_health' => ($type === 'command_center' || $type === 'war_factory') ? 500 : 350,
            'income_per_tick' => $incomePerTick,
            'built_at' => gmdate('Y-m-d\TH:i:s\Z')
        ];

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'building' => $world['buildings'][$bId],
            'treasury' => $world['players'][$playerId]['treasury']
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    case 'recruit':
        $playerId = $request['playerId'] ?? '';
        $unitId = $request['unitId'] ?? '';

        if (!isset($world['players'][$playerId]) || !isset($world['units'][$unitId])) {
            http_response_code(400);
            echo json_encode(['error' => 'Jogador ou tropa inválida']);
            exit(0);
        }

        $unit = &$world['units'][$unitId];
        if ($unit['owner'] !== 'neutral_mercenary' && $unit['contract_status'] !== 'deserted') {
            http_response_code(400);
            echo json_encode(['error' => 'A unidade não é um mercenário neutro disponível para contratação']);
            exit(0);
        }

        $hireCost = 100.0;
        if ($world['players'][$playerId]['treasury'] < $hireCost) {
            http_response_code(400);
            echo json_encode(['error' => 'Fundos insuficientes para contratar mercenário ($100 necessário)']);
            exit(0);
        }

        $world['players'][$playerId]['treasury'] -= $hireCost;
        $unit['owner'] = $playerId;
        $unit['contract_status'] = 'active';
        $unit['color'] = $world['players'][$playerId]['color'] ?? '#00d9ff';
        $unit['name'] = 'Mercenário Reintegrado';

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'unit' => $unit,
            'treasury' => $world['players'][$playerId]['treasury']
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    case 'adjust_economy':
        $playerId = $request['playerId'] ?? '';
        $delta = (float)($request['delta'] ?? 0);
        $forceUnpaid = !empty($request['forceUnpaid']);

        if (isset($world['players'][$playerId])) {
            if ($forceUnpaid) {
                $world['players'][$playerId]['treasury'] = 0;
                $world['players'][$playerId]['unpaid_ticks'] = ($world['players'][$playerId]['unpaid_ticks'] ?? 0) + 1;
            } else {
                $world['players'][$playerId]['treasury'] += $delta;
            }
        }

        saveWorldState($stateFile, $world);

        echo json_encode([
            'success' => true,
            'player' => $world['players'][$playerId] ?? null
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;

    default:
        echo json_encode([
            'service' => 'Captalvo Big Armada Authoritative Engine',
            'version' => '0.1.0-alpha',
            'sector' => 'Uberaba, MG, Brazil',
            'status' => 'online',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z')
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        break;
}

// Function for Server-Sent Events (SSE) Stream
function handleSSEStream(string $file): void {
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }
    @ini_set('zlib.output_compression', '0');
    @ini_set('implicit_flush', '1');
    @ob_end_clean();

    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    $lastModified = 0;
    $start = time();

    while (time() - $start < 30) { // Keep alive for 30s max per request, client auto-reconnects
        if (file_exists($file)) {
            $mtime = filemtime($file);
            if ($mtime > $lastModified) {
                $lastModified = $mtime;
                $world = loadWorldState($file);
                $payload = json_encode(['snapshot' => $world]);
                echo "event: tick\n";
                echo "data: {$payload}\n\n";
                @flush();
            }
        }
        usleep(1000000); // 1 second interval
    }
}


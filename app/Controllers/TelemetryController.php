<?php
declare(strict_types=1);

namespace Captalvo\Controllers;

/**
 * TelemetryController
 * Automated remote log ingestion, aggregation & admin queries.
 */
class TelemetryController
{
    private string $storageDir;
    private string $sessionsDir;

    public function __construct()
    {
        $baseApp = dirname(__DIR__);
        $this->storageDir = $baseApp . '/storage/logs';
        $this->sessionsDir = $this->storageDir . '/sessions';

        $this->ensureDirectories();
    }

    private function ensureDirectories(): void
    {
        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0755, true);
        }
        if (!is_dir($this->sessionsDir)) {
            @mkdir($this->sessionsDir, 0755, true);
        }

        // Place .htaccess to prevent direct web access to logs if located within web root
        $htAccess = $this->storageDir . '/.htaccess';
        if (!file_exists($htAccess)) {
            @file_put_contents($htAccess, "Order Deny,Allow\nDeny from all\n");
        }
    }

    public function ingest(): array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            http_response_code(400);
            return [
                'status' => 'error',
                'message' => 'Empty payload received'
            ];
        }

        // Limit payload size to 4 MB to prevent abuse
        if (strlen($raw) > 4 * 1024 * 1024) {
            http_response_code(413);
            return [
                'status' => 'error',
                'message' => 'Payload exceeds 4MB limit'
            ];
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            http_response_code(400);
            return [
                'status' => 'error',
                'message' => 'Invalid JSON payload'
            ];
        }

        $sessionId = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($data['session_id'] ?? 'sess_' . bin2hex(random_bytes(8))));
        $clientTimestamp = (string)($data['timestamp'] ?? gmdate('Y-m-d\TH:i:s\Z'));
        $environment = is_array($data['environment'] ?? null) ? $data['environment'] : [];
        $events = is_array($data['events'] ?? null) ? $data['events'] : [];
        $cache = is_array($data['cache'] ?? null) ? $data['cache'] : [];
        $bridge = is_array($data['bridge'] ?? null) ? $data['bridge'] : [];
        $engine = is_array($data['engine'] ?? null) ? $data['engine'] : [];
        $consent = is_array($data['consent'] ?? null) ? $data['consent'] : [];

        $record = [
            'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
            'client_time' => $clientTimestamp,
            'session_id' => $sessionId,
            'client_ip' => $this->getClientIp(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'consent' => $consent,
            'environment' => $environment,
            'cache' => $cache,
            'bridge' => $bridge,
            'engine' => $engine,
            'event_count' => count($events),
            'events' => $events
        ];

        // 1. Append to rotating daily JSONL file for easy tailing/grepping
        $dailyFile = $this->storageDir . '/captalvo_telemetry_' . gmdate('Y-m-d') . '.jsonl';
        @file_put_contents($dailyFile, json_encode($record, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);

        // 2. Append/update dedicated session log file
        $sessionFile = $this->sessionsDir . '/session_' . $sessionId . '.json';
        $existingSession = [];
        if (file_exists($sessionFile)) {
            $sessContent = @file_get_contents($sessionFile);
            if ($sessContent) {
                $existingSession = json_decode($sessContent, true) ?: [];
            }
        }

        if (empty($existingSession)) {
            $existingSession = [
                'session_id' => $sessionId,
                'created_at' => $record['server_time'],
                'updated_at' => $record['server_time'],
                'environment' => $environment,
                'cache' => $cache,
                'bridge' => $bridge,
                'engine' => $engine,
                'consent' => $consent,
                'client_ip' => $record['client_ip'],
                'user_agent' => $record['user_agent'],
                'events' => $events
            ];
        } else {
            $existingSession['updated_at'] = $record['server_time'];
            if (!empty($environment)) {
                $existingSession['environment'] = array_merge($existingSession['environment'] ?? [], $environment);
            }
            if (!empty($cache)) {
                $existingSession['cache'] = $cache;
            }
            if (!empty($bridge)) {
                $existingSession['bridge'] = $bridge;
            }
            if (!empty($engine)) {
                $existingSession['engine'] = $engine;
            }
            $existingSession['events'] = array_merge($existingSession['events'] ?? [], $events);
        }

        @file_put_contents($sessionFile, json_encode($existingSession, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

        // Clean up logs older than 30 days (1% chance per request to avoid overhead)
        if (mt_rand(1, 100) === 1) {
            $this->purgeOldLogs(30);
        }

        return [
            'status' => 'ok',
            'logged' => true,
            'session_id' => $sessionId,
            'received_events' => count($events),
            'server_time' => $record['server_time']
        ];
    }

    public function getRecent(int $limit = 50): array
    {
        $dailyFile = $this->storageDir . '/captalvo_telemetry_' . gmdate('Y-m-d') . '.jsonl';
        if (!file_exists($dailyFile)) {
            return [
                'status' => 'ok',
                'entries' => [],
                'message' => 'No telemetry logs recorded for today yet.'
            ];
        }

        $lines = file($dailyFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) {
            return ['status' => 'ok', 'entries' => []];
        }

        $slice = array_slice($lines, -$limit);
        $entries = array_map(function ($line) {
            return json_decode($line, true) ?: ['raw' => $line];
        }, array_reverse($slice));

        return [
            'status' => 'ok',
            'count' => count($entries),
            'entries' => $entries
        ];
    }

    public function getStats(): array
    {
        $sessionFiles = glob($this->sessionsDir . '/session_*.json') ?: [];
        $totalSessions = count($sessionFiles);

        $fileRankingMap = [];
        $totalReads = 0;
        $totalBytesMB = 0;
        $modeDistribution = [];
        $recentErrors = [];

        foreach (array_slice($sessionFiles, -20) as $sFile) {
            $content = @file_get_contents($sFile);
            if (!$content) continue;
            $sess = json_decode($content, true);
            if (!is_array($sess)) continue;

            $mode = $sess['bridge']['storageMode'] ?? $sess['cache']['mode'] ?? 'automatic';
            $modeDistribution[$mode] = ($modeDistribution[$mode] ?? 0) + 1;

            if (isset($sess['bridge']['fileRanking']) && is_array($sess['bridge']['fileRanking'])) {
                foreach ($sess['bridge']['fileRanking'] as $fr) {
                    $fn = $fr['file'] ?? 'unknown';
                    if (!isset($fileRankingMap[$fn])) {
                        $fileRankingMap[$fn] = [
                            'file' => $fn,
                            'reads' => 0,
                            'bytesMB' => 0,
                            'hits' => 0,
                            'totalWaitMs' => 0,
                            'sessions' => 0
                        ];
                    }
                    $fileRankingMap[$fn]['reads'] += (int)($fr['reads'] ?? 0);
                    $fileRankingMap[$fn]['bytesMB'] += (float)($fr['bytesMB'] ?? 0);
                    $fileRankingMap[$fn]['totalWaitMs'] += (float)($fr['totalWaitMs'] ?? 0);
                    $fileRankingMap[$fn]['sessions']++;
                    $totalReads += (int)($fr['reads'] ?? 0);
                    $totalBytesMB += (float)($fr['bytesMB'] ?? 0);
                }
            }

            if (isset($sess['events']) && is_array($sess['events'])) {
                foreach ($sess['events'] as $evt) {
                    if (in_array($evt['level'] ?? '', ['error', 'fatal', 'warn'], true)) {
                        $recentErrors[] = [
                            'session_id' => $sess['session_id'] ?? 'unknown',
                            'time' => $evt['time'] ?? '',
                            'level' => $evt['level'],
                            'category' => $evt['category'] ?? '',
                            'message' => $evt['message'] ?? ''
                        ];
                        if (count($recentErrors) >= 20) break 2;
                    }
                }
            }
        }

        $ranking = array_values($fileRankingMap);
        usort($ranking, fn($a, $b) => $b['reads'] <=> $a['reads']);

        return [
            'status' => 'ok',
            'summary' => [
                'total_sessions' => $totalSessions,
                'total_reads' => $totalReads,
                'total_bytes_mb' => round($totalBytesMB, 2),
                'mode_distribution' => $modeDistribution,
                'storage_logs_mb' => round($this->getDirectorySize($this->storageDir) / (1024 * 1024), 2)
            ],
            'file_ranking' => $ranking,
            'recent_errors' => array_slice($recentErrors, 0, 15)
        ];
    }

    private function purgeOldLogs(int $retentionDays = 30): void
    {
        $cutoff = time() - ($retentionDays * 86400);

        // Clean daily JSONL files
        $dailyFiles = glob($this->storageDir . '/captalvo_telemetry_*.jsonl') ?: [];
        foreach ($dailyFiles as $file) {
            if (filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }

        // Clean session JSON files
        $sessionFiles = glob($this->sessionsDir . '/session_*.json') ?: [];
        foreach ($sessionFiles as $file) {
            if (filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }

    private function getDirectorySize(string $dir): int
    {
        $size = 0;
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)) as $file) {
            $size += $file->getSize();
        }
        return $size;
    }

    private function getClientIp(): string
    {
        return $_SERVER['HTTP_CF_CONNECTING_IP']
            ?? $_SERVER['HTTP_X_FORWARDED_FOR']
            ?? $_SERVER['REMOTE_ADDR']
            ?? '127.0.0.1';
    }
}

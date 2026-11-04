<?php
declare(strict_types=1);

namespace Captalvo\Controllers;

/**
 * TelemetryController
 * Automated remote log ingestion for real-time debugging & crash analysis.
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

        // Limit payload size to 2 MB to prevent abuse
        if (strlen($raw) > 2 * 1024 * 1024) {
            http_response_code(413);
            return [
                'status' => 'error',
                'message' => 'Payload exceeds 2MB limit'
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

        $record = [
            'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
            'client_time' => $clientTimestamp,
            'session_id' => $sessionId,
            'client_ip' => $this->getClientIp(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'environment' => $environment,
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
                'client_ip' => $record['client_ip'],
                'user_agent' => $record['user_agent'],
                'events' => $events
            ];
        } else {
            $existingSession['updated_at'] = $record['server_time'];
            if (!empty($environment)) {
                $existingSession['environment'] = array_merge($existingSession['environment'] ?? [], $environment);
            }
            $existingSession['events'] = array_merge($existingSession['events'] ?? [], $events);
        }

        @file_put_contents($sessionFile, json_encode($existingSession, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

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

    private function getClientIp(): string
    {
        return $_SERVER['HTTP_CF_CONNECTING_IP']
            ?? $_SERVER['HTTP_X_FORWARDED_FOR']
            ?? $_SERVER['REMOTE_ADDR']
            ?? '127.0.0.1';
    }
}

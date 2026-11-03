<?php
declare(strict_types=1);

namespace Captalvo;

/**
 * Captalvo Application Bootstrap
 * Backend framework entry point
 */
class Bootstrap
{
    private static ?Bootstrap $instance = null;
    private array $config = [];

    public static function init(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        // Error reporting & production defaults
        error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
        ini_set('display_errors', '0');
        ini_set('log_errors', '1');

        // Autoloader for Captalvo namespace
        spl_autoload_register(function (string $class) {
            $prefix = 'Captalvo\\';
            $baseDir = __DIR__ . '/';
            $len = strlen($prefix);

            if (strncmp($prefix, $class, $len) !== 0) {
                return;
            }

            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

            if (file_exists($file)) {
                require_once $file;
            }
        });

        // Load configuration
        $configFile = __DIR__ . '/Config/app.php';
        if (file_exists($configFile)) {
            $this->config = require $configFile;
        }
    }

    public function getConfig(string $key, mixed $default = null): mixed
    {
        return $this->config[$key] ?? $default;
    }
}

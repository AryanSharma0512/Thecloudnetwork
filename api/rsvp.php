<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function log_event(string $eventSlug, string $email, string $result, string $code = ''): void
{
    $logDir = __DIR__ . '/logs';
    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('c');
    $line = sprintf("%s\t%s\t%s\t%s\t%s\n", $timestamp, $eventSlug, $email, $result, $code);

    try {
        if (!is_dir($logDir)) {
            mkdir($logDir, 0775, true);
        }
        $logFile = $logDir . '/rsvp.log';
        file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
    } catch (Throwable $e) {
        error_log('RSVP log failure: ' . $e->getMessage());
    }
}

function get_env(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }
    $value = trim((string) $value);
    return $value !== '' ? $value : $default;
}

function create_pdo(): PDO
{
    $dbHost = get_env('APP_DB_HOST');
    $dbName = get_env('APP_DB_NAME');
    $dbUser = get_env('APP_DB_USER');
    $dbPass = get_env('APP_DB_PASS');

    if (!$dbHost || !$dbName || !$dbUser) {
        throw new RuntimeException('Database configuration missing');
    }

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbName);

    return new PDO($dsn, $dbUser, $dbPass ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function handle_lookup(): void
{
    $emailRaw = filter_input(INPUT_GET, 'email', FILTER_UNSAFE_RAW);
    $email = is_string($emailRaw) ? trim($emailRaw) : '';

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(400, [
            'status' => 'error',
            'error' => 'Invalid email supplied',
            'existingUser' => false,
        ]);
    }

    $eventSlug = get_env('APP_EVENT_SLUG', 'apply-event');

    try {
        $pdo = create_pdo();
        $stmt = $pdo->prepare('SELECT event_slug, latest_event, full_name, email, phone, major, grad_year, notes, consent FROM rsvps WHERE email = :email LIMIT 1');
        $stmt->bindValue(':email', $email);
        $stmt->execute();

        $record = $stmt->fetch();

        if (!$record) {
            respond(404, [
                'status' => 'not_found',
                'existingUser' => false,
            ]);
        }

        $fullName = isset($record['full_name']) ? trim((string) $record['full_name']) : '';
        $latestEvent = null;
        if (isset($record['latest_event']) && $record['latest_event'] !== null && $record['latest_event'] !== '') {
            $latestEvent = (string) $record['latest_event'];
        } elseif (isset($record['event_slug'])) {
            $latestEvent = (string) $record['event_slug'];
        }

        $payload = [
            'status' => 'ok',
            'existingUser' => true,
            'name' => $fullName,
            'latest_event' => $latestEvent,
            'current_event' => $eventSlug,
            'data' => [
                'full_name' => $fullName,
                'email' => $record['email'] ?? $email,
                'phone' => $record['phone'] ?? null,
                'major' => $record['major'] ?? null,
                'grad_year' => $record['grad_year'] ?? null,
                'notes' => $record['notes'] ?? null,
                'consent' => isset($record['consent']) ? (int) $record['consent'] : null,
                'latest_event' => $latestEvent,
            ],
        ];

        respond(200, $payload);
    } catch (Throwable $e) {
        error_log('RSVP lookup failure: ' . $e->getMessage());
        respond(500, [
            'status' => 'error',
            'error' => 'Lookup failed',
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['lookup'])) {
    handle_lookup();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = filter_input_array(INPUT_POST, [
    'full_name' => FILTER_UNSAFE_RAW,
    'email' => FILTER_UNSAFE_RAW,
    'phone' => FILTER_UNSAFE_RAW,
    'major' => FILTER_UNSAFE_RAW,
    'grad_year' => FILTER_UNSAFE_RAW,
    'notes' => FILTER_UNSAFE_RAW,
    'consent' => FILTER_UNSAFE_RAW,
    'honey' => FILTER_UNSAFE_RAW,
]) ?? [];

$fullName = isset($input['full_name']) ? trim((string) $input['full_name']) : '';
$email = isset($input['email']) ? trim((string) $input['email']) : '';
$phone = isset($input['phone']) ? trim((string) $input['phone']) : '';
$major = isset($input['major']) ? trim((string) $input['major']) : '';
$gradYear = isset($input['grad_year']) ? trim((string) $input['grad_year']) : '';
$notes = isset($input['notes']) ? trim((string) $input['notes']) : '';
$consentRaw = $input['consent'] ?? null;
$honey = isset($input['honey']) ? trim((string) $input['honey']) : '';

$eventSlug = get_env('APP_EVENT_SLUG', 'apply-event');
$remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
$ipBinary = $remoteAddr !== '' ? @inet_pton($remoteAddr) : null;
$userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

if ($honey !== '') {
    log_event($eventSlug, $email, 'spam', 'honeypot');
    respond(200, ['ok' => true, 'message' => 'RSVP recorded']);
}

$maxLengths = [
    'full_name' => 100,
    'email' => 254,
    'phone' => 40,
    'major' => 120,
    'grad_year' => 4,
    'notes' => 4000,
];

$lengthCheck = static function (?string $value, int $limit): bool {
    if ($value === null) {
        return true;
    }
    if ($value === '') {
        return true;
    }
    if (function_exists('mb_strlen')) {
        return mb_strlen($value) <= $limit;
    }
    return strlen($value) <= $limit;
};

if ($fullName === '') {
    respond(422, ['ok' => false, 'error' => 'Name and valid email are required.']);
}

if (!$lengthCheck($fullName, $maxLengths['full_name'])) {
    respond(422, ['ok' => false, 'error' => 'Name must be 100 characters or fewer.']);
}

if ($email === '') {
    respond(422, ['ok' => false, 'error' => 'Name and valid email are required.']);
}

if (!$lengthCheck($email, $maxLengths['email'])) {
    respond(422, ['ok' => false, 'error' => 'Email must be 254 characters or fewer.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['ok' => false, 'error' => 'Name and valid email are required.']);
}

if ($phone !== '' && !$lengthCheck($phone, $maxLengths['phone'])) {
    respond(422, ['ok' => false, 'error' => 'Phone number is too long.']);
}

if ($major !== '' && !$lengthCheck($major, $maxLengths['major'])) {
    respond(422, ['ok' => false, 'error' => 'Major is too long.']);
}

if ($gradYear !== '') {
    if (!$lengthCheck($gradYear, $maxLengths['grad_year']) || !preg_match('/^\d{4}$/', $gradYear)) {
        respond(422, ['ok' => false, 'error' => 'Graduation year must be four digits.']);
    }
}

if ($notes !== '' && !$lengthCheck($notes, $maxLengths['notes'])) {
    respond(422, ['ok' => false, 'error' => 'Notes are too long.']);
}

$consentGiven = false;
if (is_array($consentRaw)) {
    $consentGiven = !empty(array_filter($consentRaw, static fn($v) => $v !== '' && $v !== '0'));
} else {
    $consentValue = is_string($consentRaw) ? trim($consentRaw) : $consentRaw;
    $consentGiven = !empty($consentValue) && $consentValue !== '0';
}

$pdo = null;
try {
    $pdo = create_pdo();

    $sql = 'INSERT INTO rsvps (event_slug, latest_event, full_name, email, phone, major, grad_year, notes, consent, ip, user_agent)
            VALUES (:event_slug, :latest_event, :full_name, :email, :phone, :major, :grad_year, :notes, :consent, :ip, :user_agent)
            ON DUPLICATE KEY UPDATE latest_event = VALUES(latest_event)';

    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':event_slug', $eventSlug);
    $stmt->bindValue(':latest_event', $eventSlug);
    $stmt->bindValue(':full_name', $fullName);
    $stmt->bindValue(':email', $email);
    $stmt->bindValue(':phone', $phone !== '' ? $phone : null);
    $stmt->bindValue(':major', $major !== '' ? $major : null);
    $stmt->bindValue(':grad_year', $gradYear !== '' ? $gradYear : null);
    $stmt->bindValue(':notes', $notes !== '' ? $notes : null);
    $stmt->bindValue(':consent', $consentGiven ? 1 : 0, PDO::PARAM_INT);
    if ($ipBinary !== null) {
        $stmt->bindValue(':ip', $ipBinary, PDO::PARAM_STR);
    } else {
        $stmt->bindValue(':ip', null, PDO::PARAM_NULL);
    }
    if ($userAgent !== '') {
        $stmt->bindValue(':user_agent', $userAgent, PDO::PARAM_STR);
    } else {
        $stmt->bindValue(':user_agent', null, PDO::PARAM_NULL);
    }
    $stmt->execute();

    $consentCode = $consentGiven ? 'consent=1' : 'consent=0';
    log_event($eventSlug, $email, 'success', $consentCode);
    respond(200, ['ok' => true, 'message' => 'RSVP recorded']);
} catch (Throwable $e) {
    if ($pdo !== null) {
        error_log('RSVP DB failure: ' . $e->getMessage());
    } else {
        error_log('RSVP configuration failure: ' . $e->getMessage());
    }
    log_event($eventSlug, $email, 'error', 'db');
    respond(500, ['ok' => false, 'error' => 'Save failed']);
}

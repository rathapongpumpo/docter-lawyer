<?php
/**
 * Doctor Lawyer - High Performance LiteSpeed / Apache API Engine
 * Version: 2.3.0
 * Pure PHP 8.x with SQLite3 PDO, zero external dependencies.
 */

declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');

// 1. CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Guest-ID');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 2. Load .env file
function load_env(): array {
    $candidates = [
        __DIR__ . '/.env',
        dirname(__DIR__) . '/app/.env',
        __DIR__ . '/../app/.env',
        dirname(__DIR__) . '/.env'
    ];
    $env = [];
    foreach ($candidates as $file) {
        if (file_exists($file) && is_readable($file)) {
            $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $k = trim($k);
                $v = trim($v, " \t\n\r\0\x0B'\"");
                $env[$k] = $v;
                if (!isset($_ENV[$k])) {
                    $_ENV[$k] = $v;
                    putenv("$k=$v");
                }
            }
            break;
        }
    }
    return $env;
}

$ENV = load_env();

$LINE_OA_ID = $ENV['LINE_OA_ID'] ?? '@doctorlawyer';
$LINE_OA_URL = $ENV['LINE_OA_URL'] ?? 'https://lin.ee/NQLCu3p';
$LINE_LIFF_ID = $ENV['LINE_LIFF_ID'] ?? '2012301635-WMe8TR6J';
$LINE_LIFF_URL = $ENV['LINE_LIFF_URL'] ?? 'https://liff.line.me/2012301635-WMe8TR6J';
$GEMINI_API_KEY = $ENV['GEMINI_API_KEY'] ?? '';
$GEMINI_MODEL = $ENV['GEMINI_MODEL'] ?? 'gemini-2.5-flash';
$AI_API_KEY = $ENV['AI_API_KEY'] ?? '';
$AI_API_BASE = rtrim($ENV['AI_API_BASE'] ?? 'https://api.groq.com/openai/v1', '/');
$AI_MODEL = $ENV['AI_MODEL'] ?? 'openai/gpt-oss-120b';

// 3. Database Connection
function get_db(): PDO {
    static $db = null;
    if ($db !== null) return $db;

    $candidates = [
        dirname(__DIR__) . '/app/backend/src/data/doctor_lawyer.db',
        __DIR__ . '/doctor_lawyer.db',
        __DIR__ . '/../doctor_lawyer.db'
    ];

    $db_path = null;
    foreach ($candidates as $cand) {
        $dir = dirname($cand);
        if (is_dir($dir) && is_writable($dir)) {
            $db_path = $cand;
            break;
        }
    }
    if (!$db_path) {
        $db_path = __DIR__ . '/doctor_lawyer.db';
    }

    $db = new PDO('sqlite:' . $db_path);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Initialize tables
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            auth_provider TEXT DEFAULT 'email',
            is_verified INTEGER DEFAULT 0,
            verification_code TEXT,
            code_expires_at REAL,
            free_quota INTEGER DEFAULT 3,
            quota_used INTEGER DEFAULT 0,
            quota_reset_date TEXT,
            created_at REAL NOT NULL,
            last_login_at REAL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS guest_sessions (
            guest_id TEXT PRIMARY KEY,
            quota_used INTEGER DEFAULT 0,
            max_quota INTEGER DEFAULT 1,
            quota_reset_date TEXT,
            ip_address TEXT,
            created_at REAL NOT NULL,
            last_seen_at REAL
        );
    ");

    return $db;
}

// 4. Auth & Quota Helpers
function get_today(): string {
    return date('Y-m-d');
}

function get_current_user_or_guest(PDO $db): array {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token = '';
    if (preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
        $token = $m[1];
    }

    $user = null;
    $today = get_today();

    if ($token !== '') {
        $stmt = $db->prepare("
            SELECT u.* FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            LIMIT 1
        ");
        $stmt->execute([$token, time()]);
        $u = $stmt->fetch();
        if ($u) {
            // Check quota reset
            if (($u['quota_reset_date'] ?? '') !== $today) {
                $up = $db->prepare("UPDATE users SET quota_used = 0, quota_reset_date = ? WHERE id = ?");
                $up->execute([$today, $u['id']]);
                $u['quota_used'] = 0;
                $u['quota_reset_date'] = $today;
            }
            $u['remaining'] = max(0, (int)$u['free_quota'] - (int)$u['quota_used']);
            $user = $u;
        }
    }

    $guest_id = $headers['X-Guest-ID'] ?? $headers['x-guest-id'] ?? 'guest_default';
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }

    // Guest lookup or creation
    $stmt = $db->prepare("SELECT * FROM guest_sessions WHERE guest_id = ? LIMIT 1");
    $stmt->execute([$guest_id]);
    $guest = $stmt->fetch();

    if (!$guest) {
        $now = time();
        $ins = $db->prepare("
            INSERT INTO guest_sessions (guest_id, quota_used, max_quota, quota_reset_date, ip_address, created_at, last_seen_at)
            VALUES (?, 0, 1, ?, ?, ?, ?)
        ");
        $ins->execute([$guest_id, $today, $ip, $now, $now]);
        $guest = [
            'guest_id' => $guest_id,
            'quota_used' => 0,
            'max_quota' => 1,
            'quota_reset_date' => $today,
            'remaining' => 1
        ];
    } else {
        if (($guest['quota_reset_date'] ?? '') !== $today) {
            $up = $db->prepare("UPDATE guest_sessions SET quota_used = 0, quota_reset_date = ? WHERE guest_id = ?");
            $up->execute([$today, $guest_id]);
            $guest['quota_used'] = 0;
            $guest['quota_reset_date'] = $today;
        }
        $guest['remaining'] = max(0, (int)$guest['max_quota'] - (int)$guest['quota_used']);
    }

    return [$user, $guest];
}

// 5. PII Masking
function mask_pii(string $text): string {
    // Thai National ID: 13 digits
    $text = preg_replace('/\b\d{1}\s?-?\d{4}\s?-?\d{5}\s?-?\d{2}\s?-?\d{1}\b/', '[รหัสบัตรประชาชน 13 หลัก ปิดข้อมูล PDPA]', $text);
    // Bank Account: 10-12 digits
    $text = preg_replace('/\b\d{3}\s?-?\d{1}\s?-?\d{5}\s?-?\d{1}\b/', '[เลขที่บัญชีธนาคาร ปิดข้อมูล PDPA]', $text);
    // Thai Phone Numbers (06x, 08x, 09x)
    $text = preg_replace('/\b0[689]\d{1}\s?-?\d{3}\s?-?\d{4}\b/', '[เบอร์โทรศัพท์ ปิดข้อมูล PDPA]', $text);
    return $text;
}

// 6. Legal Knowledge Base (Tier 1 Rule Engine)
function load_categories(): array {
    static $cats = null;
    if ($cats !== null) return $cats;

    $candidates = [
        dirname(__DIR__) . '/app/backend/src/data/legal_knowledge',
        __DIR__ . '/legal_knowledge',
        __DIR__ . '/../backend/src/data/legal_knowledge'
    ];

    $dir = null;
    foreach ($candidates as $cand) {
        if (is_dir($cand) && file_exists($cand . '/index.json')) {
            $dir = $cand;
            break;
        }
    }

    $cats = [];
    if (!$dir) return $cats;

    $index = json_decode(file_get_contents($dir . '/index.json'), true);
    foreach ($index['categories'] ?? [] as $c) {
        $file = $dir . '/' . ($c['file'] ?? '');
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file), true);
            if ($data && isset($data['id'])) {
                $cats[$data['id']] = $data;
            }
        }
    }
    return $cats;
}

function evaluate_rule_engine(string $query, array $categories): ?array {
    $clean = mb_strtolower($query, 'UTF-8');
    $best_cat = null;
    $best_score = 0.0;
    $matched_keywords = [];

    foreach ($categories as $cat_id => $cat) {
        $keywords = $cat['keywords'] ?? [];
        $score = 0.0;
        $matches = [];

        foreach ($keywords as $kw) {
            $kw_lower = mb_strtolower($kw, 'UTF-8');
            if (mb_strpos($clean, $kw_lower, 0, 'UTF-8') !== false) {
                $matches[] = $kw;
                $score += 1.0 + (mb_strlen($kw_lower, 'UTF-8') * 0.1);
            }
        }

        // Domain-specific boosters
        if ($cat_id === 'CAT-01' && preg_match('/โอนเงิน|มิจฉาชีพ|บัญชีม้า/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-02' && preg_match('/ดอกเบี้ย|กู้เงิน|ยืมเงิน/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-03' && preg_match('/เลิกจ้าง|ไล่ออก|ค่าชดเชย|ค่าตกใจ/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-04' && preg_match('/รถชน|อุบัติเหตุ|ค่าขาดประโยชน์/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-05' && preg_match('/มรดก|พินัยกรรม|ทายาท|ฟ้องหย่า/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-06' && preg_match('/เช่าห้อง|ตัดน้ำตัดไฟ|ล็อกห้อง|เช่าซื้อ|ไฟแนนซ์/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-07' && preg_match('/ไม่ตรงปก|ชำรุด|คืนเงิน|สคบ/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-08' && preg_match('/ประจาน|หมิ่นประมาท|โพสต์ด่า/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-09' && preg_match('/ทำร้ายร่างกาย|ขโมย|ลักทรัพย์|ยักยอก/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-10' && preg_match('/ไกล่เกลี่ย|ยอมความ|ประนีประนอม|มาตรา 20 ตรี/', $clean)) $score += 2.0;
        if ($cat_id === 'CAT-11' && preg_match('/ภาษี|แม่ค้าออนไลน์|vat|สรรพากร|1\.8 ล้าน|e-payment/', $clean)) $score += 2.0;

        if ($score > $best_score) {
            $best_score = $score;
            $best_cat = $cat;
            $matched_keywords = $matches;
        }
    }

    if ($best_score < 3.0 || !$best_cat) {
        return null;
    }

    // Urgency determination
    $urgency_score = 1;
    $urgency_label = 'NORMAL';
    if (preg_match('/ด่วน|อายัด|aoc|1441|ขู่|ทำร้าย|จับกุม|ภายใน 72 ชม/', $clean)) {
        $urgency_score = 3;
        $urgency_label = 'CRITICAL';
    } elseif (preg_match('/เงิน|สัญญา|ฟ้อง|เลิกจ้าง|มรดก/', $clean)) {
        $urgency_score = 2;
        $urgency_label = 'HIGH';
    }

    // Synthesize structured 6-step consultation
    $cat_id = $best_cat['id'];
    $parts = [];

    // Part 1: Summary
    $p1 = "ท่านกำลังประสบปัญหาข้อพิพาทในหมวด **{$best_cat['category_name_th']}** ซึ่งระบบได้ตรวจพบข้อเท็จจริงและจัดเตรียมแนวทางตามบทบัญญัติแห่งกฎหมายไทยและแนวคำพิพากษาศาลฎีกาไว้ให้เรียบร้อยแล้ว";
    $parts[] = ["step" => 1, "title" => "สรุปประเด็นข้อกฎหมายและข้อเท็จจริง", "content" => $p1];

    // Part 2: Statutes
    $p2 = [];
    foreach ($best_cat['statutes'] ?? [] as $st) {
        $p2[] = "• **{$st['law_title']}**";
        foreach ($st['sections'] ?? [] as $sec) {
            $p2[] = "  - **{$sec['section_no']} ({$sec['title']}):** {$sec['text']}";
            if (!empty($sec['penalties'])) $p2[] = "    *(โทษ: {$sec['penalties']})*";
            if (!empty($sec['civil_consequence'])) $p2[] = "    *(ผลทางแพ่ง: {$sec['civil_consequence']})*";
        }
    }
    $parts[] = ["step" => 2, "title" => "สิทธิและบทบัญญัติทางกฎหมายที่คุ้มครอง", "content" => implode("\n", $p2)];

    // Part 3: Supreme Court Precedents
    $p3 = [];
    foreach ($best_cat['supreme_court_judgments'] ?? [] as $jm) {
        $p3[] = "• **{$jm['case_no']}:**";
        $p3[] = "  - *ประเด็น:* {$jm['issue']}";
        $p3[] = "  - *บรรทัดฐานศาลฎีกา:* **\"{$jm['core_principle']}\"**";
    }
    $parts[] = ["step" => 3, "title" => "คำพิพากษาศาลฎีกาเทียบเคียง (Supreme Court Precedents)", "content" => implode("\n", $p3)];

    // Part 4: Immediate Action Plan
    $p4 = [];
    if ($cat_id === "CAT-01") {
        $p4[] = "1. **โทรอายัดเงินด่วนที่สุด:** ติดต่อศูนย์ AOC 1441 ทันทีเพื่อขอรหัสแจ้งระงับธุรกรรม (Bank Case ID) ภายใน 72 ชั่วโมง";
        $p4[] = "2. **รวบรวมสลิปโอนเงินและแชท:** แคปเจอร์หน้าจอแชทและสลิปที่มี QR Code ห้ามลบแชทเด็ดขาด";
        $p4[] = "3. **แจ้งความดำเนินคดีภายใน 72 ชม.:** นำรหัสอายัดไปแจ้งความที่สถานีตำรวจหรือผ่าน thaipoliceonline.go.th";
    } elseif ($cat_id === "CAT-02") {
        $p4[] = "1. **หยุดจ่ายดอกเบี้ยที่เกินอัตราทันที:** กฎหมายถือว่าดอกเบี้ยเกิน 15%/ปี เป็นโมฆะทั้งจำนวน";
        $p4[] = "2. **คำนวณเงินที่จ่ายไปแล้ว:** นำยอดเงินที่เคยจ่ายไปหักเงินต้นทั้งหมด หากจ่ายเกินเงินต้นแล้ว หนี้ย่อมระงับสิ้นไป";
        $p4[] = "3. **บันทึกหลักฐานการทวงหนี้:** หากเจ้าหนี้ข่มขู่หรือประจาน ให้บันทึกเสียง/ภาพเพื่อดำเนินคดีตาม พ.ร.บ.ทวงหนี้";
    } elseif ($cat_id === "CAT-03") {
        $p4[] = "1. **ขอหนังสือเลิกจ้างเป็นลายลักษณ์อักษร:** ระบุวันที่ให้ออกและสาเหตุการเลิกจ้าง";
        $p4[] = "2. **ห้ามเซ็นใบลาออกเด็ดขาด:** มิฉะนั้นจะเสียสิทธิเงินชดเชยตามอายุงานและค่าตกใจทันที";
        $p4[] = "3. **ยื่นคำร้อง คร.7 ต่อพนักงานตรวจแรงงาน:** ที่สำนักงานสวัสดิการและคุ้มครองแรงงาน หรือยื่นออนไลน์";
    } elseif ($cat_id === "CAT-11") {
        $p4[] = "1. **รวบรวม Statement ทุกบัญชี:** ดึงรายการเดินบัญชีทั้งปีเพื่อรวมยอดเงินเข้าที่แท้จริง";
        $p4[] = "2. **แยกประเภทเงินโอน:** แยกรายรับจากการขายของจริง ออกจากเงินยืมหรือเงินโอนระหว่างคนในครอบครัว";
        $p4[] = "3. **ตรวจเช็กเกณฑ์ VAT 1.8 ล้าน:** หากยอดขายรวมเกิน 1.8 ล้านบาท ต้องรีบเข้าพบเจ้าหน้าที่หรือปรึกษาผู้เชี่ยวชาญเพื่อขอลดหย่อนเบี้ยปรับ";
    } else {
        $p4[] = "1. รวบรวมพยานหลักฐาน สัญญา สลิป และข้อความสนทนาทั้งหมด";
        $p4[] = "2. ส่งหนังสือบอกกล่าวทวงถามหรือหนังสือเตือนไปยังคู่กรณี";
        $p4[] = "3. พิจารณาใช้กระบวนการไกล่เกลี่ยข้อพิพาทก่อนฟ้องคดี (ป.วิ.พ. มาตรา 20 ตรี) ซึ่งไม่มีค่าธรรมเนียมศาล";
    }
    $parts[] = ["step" => 4, "title" => "ลำดับขั้นตอนที่ต้องปฏิบัติทันที", "content" => implode("\n", $p4)];

    // Part 5: Evidence Checklist
    $p5 = [];
    foreach ($best_cat['evidence_checklist'] ?? [] as $ev) {
        $p5[] = "• $ev";
    }
    $parts[] = ["step" => 5, "title" => "พยานหลักฐานที่ต้องจัดเตรียม (Evidence Checklist)", "content" => implode("\n", $p5)];

    // Part 6: Partner Lawyer Handoff
    $hl = [];
    foreach ($best_cat['hotlines'] ?? [] as $h) {
        $num = !empty($h['number']) ? " โทร. **{$h['number']}**" : "";
        $press = !empty($h['press']) ? " กด {$h['press']}" : "";
        $hl[] = "• **{$h['name']}:**{$num}{$press}";
    }
    $p6 = "📞 **ช่องทางช่วยเหลือและสายด่วนภาครัฐ:**\n" . implode("\n", $hl) . "\n\n"
        . "🤝 **บริการส่งต่องานให้ทนายความพาร์ตเนอร์ (Partner Lawyer Handoff):**\n"
        . "หากเคสของท่านมีมูลค่าความเสียหายสูง คู่กรณีไม่ยอมเจรจา หรือต้องการให้ทนายความเข้ามาร่วมตรวจเอกสาร ร่างหนังสือบอกกล่าว หรือดำเนินคดีว่าความในศาล\n"
        . "👉 ท่านสามารถกดปุ่ม **'นัดหมายปรึกษาทนายความพาร์ตเนอร์'** เพื่อส่งสรุปรูปคดีนี้ให้ทนายความผู้เชี่ยวชาญเฉพาะทางติดต่อกลับได้ทันที";
    $parts[] = ["step" => 6, "title" => "การส่งต่อทนายความพาร์ตเนอร์ & ช่องทางช่วยเหลือ", "content" => $p6];

    return [
        "matched" => true,
        "tier" => "tier_1",
        "category_id" => $best_cat['id'],
        "category_name" => $best_cat['category_name_th'],
        "confidence_score" => round(min(1.0, $best_score / 10.0), 2),
        "urgency" => ["score" => $urgency_score, "level" => $urgency_label],
        "consultation_parts" => $parts
    ];
}

// 7. AI Router (Tier 2: Gemini 2.5 Flash / Groq)
function call_gemini(string $query, string $apiKey, string $model): ?array {
    if (empty($apiKey)) return null;

    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
    $system_prompt = <<<PROMPT
คุณคือ "ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)" ผู้ช่วยทนายความ AI อัจฉริยะ ให้คำปรึกษาทางกฎหมายไทยระดับพรีเมียม
ตอบคำถามด้วยความเห็นอกเห็นใจ (Empathy first) ตามด้วยข้อกฎหมายที่กระชับและปฏิบัติได้จริง

โปรดจัดโครงสร้างคำตอบเป็น JSON Object ที่มีคีย์ "category_name", "urgency" (score 1-3), และ "consultation_parts" (array ของ 6 ขั้นตอน):
- step 1: title "สรุปประเด็นข้อกฎหมายและข้อเท็จจริง", content: ข้อเท็จจริงและประเด็นข้อพิพาท
- step 2: title "สิทธิและบทบัญญัติทางกฎหมายที่คุ้มครอง", content: มาตรากฎหมายไทยที่เกี่ยวข้อง
- step 3: title "คำพิพากษาศาลฎีกาเทียบเคียง (Supreme Court Precedents)", content: แนวบรรทัดฐานศาลฎีกา
- step 4: title "ลำดับขั้นตอนที่ต้องปฏิบัติทันที", content: ขั้นตอนปฏิบัติเป็นข้อๆ 1, 2, 3
- step 5: title "พยานหลักฐานที่ต้องจัดเตรียม (Evidence Checklist)", content: เอกสารและหลักฐานสำคัญ
- step 6: title "การส่งต่อทนายความพาร์ตเนอร์ & ช่องทางช่วยเหลือ", content: ช่องทางสายด่วนและข้อแนะนำการปรึกษาทนาย
PROMPT;

    $user_msg = "ข้อพิพาท/คำถามของผู้ใช้งาน:\n" . $query;

    $data = [
        "contents" => [
            [
                "role" => "user",
                "parts" => [
                    ["text" => $system_prompt . "\n\n" . $user_msg]
                ]
            ]
        ],
        "generationConfig" => [
            "temperature" => 0.2,
            "maxOutputTokens" => 8192,
            "responseMimeType" => "application/json"
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || !$resp) return null;

    $json = json_decode($resp, true);
    $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!$text) return null;

    $parsed = json_decode($text, true);
    if (!$parsed || !isset($parsed['consultation_parts'])) return null;

    return [
        "matched" => false,
        "tier" => "tier_2",
        "provider" => "Google Gemini API ($model)",
        "category_id" => "AI-GENERATED",
        "category_name" => $parsed['category_name'] ?? 'ข้อพิพาททั่วไป',
        "urgency" => $parsed['urgency'] ?? ["score" => 2, "level" => "HIGH"],
        "consultation_parts" => $parsed['consultation_parts']
    ];
}

function call_groq(string $query, string $apiKey, string $base, string $model): ?array {
    if (empty($apiKey)) return null;

    $url = $base . '/chat/completions';
    $system_prompt = "คุณคือ ดอกเตอร์ลอว์เยอร์ ผู้ช่วยทนายความ AI ให้คำปรึกษากฎหมายไทย ตอบเป็น JSON Object ที่มี category_name, urgency (score 1-3, level), consultation_parts (array 6 ขั้นตอน มี step, title, content)";

    $data = [
        "model" => $model,
        "messages" => [
            ["role" => "system", "content" => $system_prompt],
            ["role" => "user", "content" => $query]
        ],
        "temperature" => 0.2,
        "response_format" => ["type" => "json_object"]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || !$resp) return null;

    $json = json_decode($resp, true);
    $text = $json['choices'][0]['message']['content'] ?? '';
    if (!$text) return null;

    $parsed = json_decode($text, true);
    if (!$parsed || !isset($parsed['consultation_parts'])) return null;

    return [
        "matched" => false,
        "tier" => "tier_2",
        "provider" => "Groq Cloud ($model)",
        "category_id" => "AI-GENERATED",
        "category_name" => $parsed['category_name'] ?? 'ข้อพิพาททั่วไป',
        "urgency" => $parsed['urgency'] ?? ["score" => 2, "level" => "HIGH"],
        "consultation_parts" => $parsed['consultation_parts']
    ];
}

// 8. Routing
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = preg_replace('#^/+#', '/', $path);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

header('Content-Type: application/json; charset=utf-8');

function json_out(array $data, int $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$db = get_db();

// ----------------- GET /api/health -----------------
if ($method === 'GET' && ($path === '/api/health' || $path === '/api/health/')) {
    [$user, $guest] = get_current_user_or_guest($db);
    $categories = load_categories();

    json_out([
        "status" => "healthy",
        "app_name" => "ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)",
        "version" => "2.3.0",
        "tiers" => [
            "tier_1" => ["name" => "Rule Engine", "categories_loaded" => count($categories)],
            "tier_2" => [
                "provider" => !empty($GEMINI_API_KEY) ? "Google Gemini API (Free Tier)" : "Offline Heuristic",
                "model" => $GEMINI_MODEL,
                "status" => "Ready",
                "cost" => "0 THB"
            ]
        ],
        "partner_lawyer_handoff" => [
            "channel" => "LINE Official Account (LINE OA)",
            "line_oa_id" => $LINE_OA_ID,
            "line_oa_url" => $LINE_OA_URL
        ],
        "session" => [
            "user_type" => $user ? "member" : "guest",
            "remaining" => $user ? $user['remaining'] : $guest['remaining']
        ]
    ]);
}

// ----------------- GET /api/config -----------------
if ($method === 'GET' && ($path === '/api/config' || $path === '/api/config/')) {
    json_out([
        "line_liff_id" => $LINE_LIFF_ID,
        "line_liff_url" => $LINE_LIFF_URL,
        "line_oa_url" => $LINE_OA_URL
    ]);
}

// ----------------- GET /api/auth/me -----------------
if ($method === 'GET' && ($path === '/api/auth/me' || $path === '/api/auth/me/')) {
    [$user, $guest] = get_current_user_or_guest($db);
    if ($user) {
        json_out([
            "authenticated" => true,
            "user" => [
                "id" => $user['id'],
                "email" => $user['email'],
                "name" => $user['name'],
                "auth_provider" => $user['auth_provider'],
                "free_quota" => (int)$user['free_quota'],
                "quota_used" => (int)$user['quota_used'],
                "remaining" => (int)$user['remaining']
            ]
        ]);
    } else {
        json_out([
            "authenticated" => false,
            "guest" => [
                "guest_id" => $guest['guest_id'],
                "quota_used" => (int)$guest['quota_used'],
                "max_quota" => (int)$guest['max_quota'],
                "remaining" => (int)$guest['remaining']
            ]
        ]);
    }
}

// Read JSON Body for POST
$raw_body = file_get_contents('php://input');
$body = json_decode($raw_body, true) ?? [];

// ----------------- POST /api/auth/email/request-otp -----------------
if ($method === 'POST' && $path === '/api/auth/email/request-otp') {
    $email = trim($body['email'] ?? '');
    $name = trim($body['name'] ?? '');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(["success" => false, "error" => "กรุณากรอกอีเมลให้ถูกต้อง"], 400);
    }

    $otp = sprintf('%06d', random_int(100000, 999999));
    $expires = time() + 300; // 5 minutes
    $now = time();
    $today = get_today();

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    if ($u) {
        $up = $db->prepare("UPDATE users SET verification_code = ?, code_expires_at = ?, name = COALESCE(NULLIF(?, ''), name) WHERE id = ?");
        $up->execute([$otp, $expires, $name, $u['id']]);
    } else {
        $ins = $db->prepare("
            INSERT INTO users (email, name, auth_provider, is_verified, verification_code, code_expires_at, free_quota, quota_used, quota_reset_date, created_at, last_login_at)
            VALUES (?, ?, 'email', 0, ?, ?, 3, 0, ?, ?, ?)
        ");
        $ins->execute([$email, $name ?: explode('@', $email)[0], $otp, $expires, $today, $now, $now]);
    }

    json_out([
        "success" => true,
        "message" => "ส่งรหัส OTP 6 หลักไปยังอีเมลเรียบร้อยแล้ว",
        "demo_otp" => $otp // Displayed on demo box for fast verification
    ]);
}

// ----------------- POST /api/auth/email/verify-otp -----------------
if ($method === 'POST' && $path === '/api/auth/email/verify-otp') {
    $email = trim($body['email'] ?? '');
    $otp = trim($body['otp'] ?? '');

    if (!$email || !$otp) {
        json_out(["success" => false, "error" => "กรุณากรอกอีเมลและรหัส OTP"], 400);
    }

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    if (!$u || $u['verification_code'] !== $otp) {
        json_out(["success" => false, "error" => "รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"], 400);
    }

    if (time() > (float)$u['code_expires_at']) {
        json_out(["success" => false, "error" => "รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่"], 400);
    }

    $token = bin2hex(random_bytes(32));
    $session_expires = time() + (30 * 86400); // 30 days
    $today = get_today();

    $db->prepare("UPDATE users SET is_verified = 1, verification_code = NULL, code_expires_at = NULL, last_login_at = ? WHERE id = ?")
       ->execute([time(), $u['id']]);

    $db->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
       ->execute([$token, $u['id'], $session_expires]);

    $remaining = max(0, (int)$u['free_quota'] - (int)$u['quota_used']);

    json_out([
        "success" => true,
        "message" => "เข้าสู่ระบบสำเร็จ",
        "session_token" => $token,
        "user" => [
            "id" => $u['id'],
            "email" => $u['email'],
            "name" => $u['name'],
            "auth_provider" => $u['auth_provider'],
            "free_quota" => (int)$u['free_quota'],
            "quota_used" => (int)$u['quota_used'],
            "remaining" => $remaining
        ]
    ]);
}

// ----------------- POST /api/auth/google -----------------
if ($method === 'POST' && $path === '/api/auth/google') {
    $email = trim($body['email'] ?? '');
    $name = trim($body['name'] ?? '');

    if (!$email) {
        json_out(["success" => false, "error" => "ข้อมูล Google Account ไม่ถูกต้อง"], 400);
    }

    $today = get_today();
    $now = time();

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    if ($u) {
        $db->prepare("UPDATE users SET is_verified = 1, last_login_at = ? WHERE id = ?")
           ->execute([$now, $u['id']]);
        $user_id = $u['id'];
        $user_quota = (int)$u['free_quota'];
        $quota_used = (int)$u['quota_used'];
    } else {
        $ins = $db->prepare("
            INSERT INTO users (email, name, auth_provider, is_verified, free_quota, quota_used, quota_reset_date, created_at, last_login_at)
            VALUES (?, ?, 'google', 1, 3, 0, ?, ?, ?)
        ");
        $ins->execute([$email, $name ?: explode('@', $email)[0], $today, $now, $now]);
        $user_id = $db->lastInsertId();
        $user_quota = 3;
        $quota_used = 0;
    }

    $token = bin2hex(random_bytes(32));
    $db->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
       ->execute([$token, $user_id, $now + (30 * 86400)]);

    json_out([
        "success" => true,
        "message" => "เข้าสู่ระบบด้วย Google สำเร็จ",
        "session_token" => $token,
        "user" => [
            "id" => $user_id,
            "email" => $email,
            "name" => $name,
            "auth_provider" => "google",
            "free_quota" => $user_quota,
            "quota_used" => $quota_used,
            "remaining" => max(0, $user_quota - $quota_used)
        ]
    ]);
}

// ----------------- POST /api/auth/line -----------------
if ($method === 'POST' && $path === '/api/auth/line') {
    $line_user_id = trim($body['line_user_id'] ?? '');
    $name = trim($body['name'] ?? 'LINE Member');

    if (!$line_user_id) {
        json_out(["success" => false, "error" => "ข้อมูล LINE User ID ไม่ถูกต้อง"], 400);
    }

    $email = "line_{$line_user_id}@doctorlawyer.ai";
    $today = get_today();
    $now = time();

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    if ($u) {
        $db->prepare("UPDATE users SET is_verified = 1, last_login_at = ? WHERE id = ?")
           ->execute([$now, $u['id']]);
        $user_id = $u['id'];
        $user_quota = (int)$u['free_quota'];
        $quota_used = (int)$u['quota_used'];
    } else {
        $ins = $db->prepare("
            INSERT INTO users (email, name, auth_provider, is_verified, free_quota, quota_used, quota_reset_date, created_at, last_login_at)
            VALUES (?, ?, 'line', 1, 3, 0, ?, ?, ?)
        ");
        $ins->execute([$email, $name, $today, $now, $now]);
        $user_id = $db->lastInsertId();
        $user_quota = 3;
        $quota_used = 0;
    }

    $token = bin2hex(random_bytes(32));
    $db->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
       ->execute([$token, $user_id, $now + (30 * 86400)]);

    json_out([
        "success" => true,
        "message" => "เข้าสู่ระบบด้วย LINE สำเร็จ",
        "session_token" => $token,
        "user" => [
            "id" => $user_id,
            "email" => $email,
            "name" => $name,
            "auth_provider" => "line",
            "free_quota" => $user_quota,
            "quota_used" => $quota_used,
            "remaining" => max(0, $user_quota - $quota_used)
        ]
    ]);
}

// ----------------- POST /api/consult -----------------
if ($method === 'POST' && ($path === '/api/consult' || $path === '/api/consult/')) {
    $query = trim($body['query'] ?? '');
    if (!$query) {
        json_out(["error" => "Missing 'query' field"], 400);
    }

    [$user, $guest] = get_current_user_or_guest($db);

    // Enforce Quota
    if ($user) {
        if ($user['quota_used'] >= $user['free_quota']) {
            json_out([
                "status" => "QUOTA_EXCEEDED",
                "error" => "QUOTA_EXCEEDED",
                "message" => "ท่านใช้สิทธิ์ปรึกษาฟรีสำหรับวันนี้ครบ 3 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) กรุณาติดต่อทนายความพาร์ตเนอร์ผ่าน LINE OA",
                "line_oa_url" => $LINE_OA_URL
            ], 403);
        }
    } else {
        if ($guest['quota_used'] >= $guest['max_quota']) {
            json_out([
                "status" => "AUTH_REQUIRED",
                "error" => "AUTH_REQUIRED",
                "message" => "ท่านใช้สิทธิ์ทดลองสำหรับวันนี้ครบ 1 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) กรุณาเข้าสู่ระบบด้วยอีเมลหรือ LINE เพื่อรับสิทธิ์ 3 ครั้ง/วัน",
                "line_oa_url" => $LINE_OA_URL
            ], 403);
        }
    }

    // Mask PII
    $masked_query = mask_pii($query);

    // Tier 1: Evaluate offline rule engine
    $categories = load_categories();
    $result = evaluate_rule_engine($masked_query, $categories);

    // Tier 2: Call Gemini if Tier 1 score is low or not matched
    if (!$result && !empty($GEMINI_API_KEY)) {
        $result = call_gemini($masked_query, $GEMINI_API_KEY, $GEMINI_MODEL);
    }

    if (!$result && !empty($AI_API_KEY)) {
        $result = call_groq($masked_query, $AI_API_KEY, $AI_API_BASE, $AI_MODEL);
    }

    // Heuristic Fallback if still no result
    if (!$result) {
        $result = [
            "matched" => false,
            "tier" => "tier_2_fallback",
            "category_id" => "GEN-00",
            "category_name" => "ข้อพิพาททั่วไป",
            "urgency" => ["score" => 2, "level" => "HIGH"],
            "consultation_parts" => [
                [
                    "step" => 1,
                    "title" => "สรุปประเด็นข้อกฎหมายและข้อเท็จจริง",
                    "content" => "ระบบได้รับเรื่องข้อพิพาทของท่านเรียบร้อยแล้ว: \"{$masked_query}\" การพิจารณารูปคดีเบื้องต้นเข้าข่ายข้อพิพาททางแพ่งและพาณิชย์ หรือความผิดที่มีผลกระทบต่อสิทธิและทรัพย์สิน"
                ],
                [
                    "step" => 2,
                    "title" => "สิทธิและบทบัญญัติทางกฎหมายที่คุ้มครอง",
                    "content" => "• **ประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 420:** ผู้ใดจงใจหรือประมาทเลินเล่อ ทำต่อบุคคลอื่นโดยผิดกฎหมาย เป็นเหตุให้เขาเสียหายถึงแก่ชีวิต ร่างกาย หรือทรัพย์สิน ผู้นั้นต้องชดใช้ค่าสินไหมทดแทน"
                ],
                [
                    "step" => 3,
                    "title" => "คำพิพากษาศาลฎีกาเทียบเคียง (Supreme Court Precedents)",
                    "content" => "• **แนวบรรทัดฐานศาลฎีกา:** การกระทำความผิดที่มีความเสียหายเกิดขึ้นชัดเจน ผู้เสียหายมีสิทธิเรียกร้องให้ชดใช้ค่าเสียหายตามความเป็นจริง และสามารถแจ้งความดำเนินคดีได้ตามอายุความ"
                ],
                [
                    "step" => 4,
                    "title" => "ลำดับขั้นตอนที่ต้องปฏิบัติทันที",
                    "content" => "1. รวบรวมเอกสาร สลิป และข้อความสนทนาทั้งหมดไว้เป็นหลักฐาน\n2. ส่งหนังสือบอกกล่าวทวงถามหรือแจ้งเตือนคู่กรณีเป็นลายลักษณ์อักษร\n3. ติดต่อเจ้าหน้าที่หรือทนายความเพื่อเตรียมยื่นเรื่องตามกระบวนการ"
                ],
                [
                    "step" => 5,
                    "title" => "พยานหลักฐานที่ต้องจัดเตรียม (Evidence Checklist)",
                    "content" => "• ภาพถ่ายหน้าจอข้อความสนทนา\n• สลิปการโอนเงินหรือใบเสร็จรับเงิน\n• สัญญาหรือเอกสารข้อตกลงที่เกี่ยวข้อง"
                ],
                [
                    "step" => 6,
                    "title" => "การส่งต่อทนายความพาร์ตเนอร์ & ช่องทางช่วยเหลือ",
                    "content" => "🤝 **บริการส่งต่องานให้ทนายความพาร์ตเนอร์ (Partner Lawyer Handoff):**\nท่านสามารถกดปุ่ม **'นัดหมายปรึกษาทนายความพาร์ตเนอร์'** เพื่อส่งเคสนี้ให้ทนายความดูแลได้อย่างรวดเร็ว"
                ]
            ]
        ];
    }

    // Deduct Quota
    if ($user) {
        $db->prepare("UPDATE users SET quota_used = quota_used + 1 WHERE id = ?")->execute([$user['id']]);
        $remaining = max(0, (int)$user['free_quota'] - ((int)$user['quota_used'] + 1));
        $user_type = "member";
    } else {
        $db->prepare("UPDATE guest_sessions SET quota_used = quota_used + 1, last_seen_at = ? WHERE guest_id = ?")
           ->execute([time(), $guest['guest_id']]);
        $remaining = max(0, (int)$guest['max_quota'] - ((int)$guest['quota_used'] + 1));
        $user_type = "guest";
    }

    $result['line_oa_url'] = $LINE_OA_URL;
    $result['quota'] = [
        "remaining" => $remaining,
        "user_type" => $user_type
    ];

    json_out($result);
}

// 404 Not Found
json_out(["error" => "Endpoint not found: $path"], 404);

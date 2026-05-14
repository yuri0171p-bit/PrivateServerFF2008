const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// ============================================================================
// CONSTANTES DE AMBIENTE (do Barbosa / Firebase / etc.)
// ============================================================================
const PORT = process.env.PORT || 10000;
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LOGIN_URL = process.env.FIREBASE_LOGIN_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LOGIN_KEY = process.env.FIREBASE_LOGIN_KEY || '';
const FIREBASE_PLAYERTKEY = process.env.FIREBASE_AUTH_SECRET || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '6LcopZUsAAAAAD8KqpgXdBhvvdolJkjDu1K6bFmh5';
const FIREBASE_BASE_URL = process.env.FIREBASE_BASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const FIREBASE_URL = FIREBASE_PLAYER_URL;

// ============================================================================
// CACHE
// ============================================================================
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60 segundos

// ============================================================================
// PERSISTÊNCIA SIMULADA (apenas Adam)
// ============================================================================
let playerProgress = {
    uid: '99999999',
    nickname: 'Player',
    gold: 1000,
    level: 1,
    diamonds: 500,
    isBanned: false,
    banReason: ''
};

const friendsList = [
    { uid: '11111111', nickname: 'KallidadeOF', level: 50, online: true },
    { uid: '22222222', nickname: 'GuerreiroBR', level: 32, online: false },
    { uid: '33333333', nickname: 'ProPlayer2025', level: 70, online: true }
];

// ============================================================================
// BYTES MISTERIOSOS (exatamente como no print)
// ============================================================================
const mysteriousBytes = [
    76, 117, 107, 105, 110, 103, 62, 32, 110, 195, 163, 111, 32,
    102, 97, 122, 32, 109, 97, 105, 115, 112, 32, 97, 114, 116,
    101, 108, 101, 115, 46, 10, 10, 84, 111, 100, 97, 115, 32,
    97, 115, 32, 99, 110, 116, 97, 115, 32, 113, 117, 101, 32,
    117, 116, 105, 108, 105, 122, 97, 109, 32, 111, 32, 115, 101,
    114, 118, 105, 100, 111, 114, 32, 112, 114, 105, 118, 97, 100,
    111, 46, 10, 79, 98, 114, 105, 103, 97, 100, 111, 32, 112, 111,
    114, 32, 101, 113, 117, 105, 112, 101, 32, 66, 97, 114, 98, 111,
    115, 97, 46
];

const extraPlayerData = {
    "5": { "2": "KallidadeOF" },
    "6": { "1": "" },
    "7": 1776539822,
    "9": 1,
    "10": 1
};

const DEFAULT_SETTINGS = {
    appstore_url: 'https://discord.gg/projectreverger',
    billboard_msg: 'Bem-vindo ao servidor privado!',
    cdn_url: 'https://cdn.barbosasmobile.com/',
    code: 0,
    country_code: 'BR',
    force_to_restart_app: false,
    gdpr_version: 2,
    is_firewall_open: false,
    is_review_server: false,
    is_server_open: true,
    maintenance_announcement: 'Este projeto não faz afiliação com a Garena.',
    remote_option_version: '1.0.0',
    remote_version: '1.43.0',
    server_url: 'https://versionscommon.barbosasmobile.com/live/',
    version: '1.43.3',
    lang: 'pt-br',
    device: 'android',
    appstore: 'googleplay',
    region: 'DEFAULT',
    is_guest: true,
    is_new_user: false,
    login_status: 1,
    is_vip: false,
    is_gm: false,
    gm_level: 0,
    show_test_btn: false,
    show_gm_panel: false,
    enable_console: false,
    character_id: 1,
    character_name: 'Adam',
    character_skin_id: 0,
    character_skin_name: '',
    inventory: [],
    character_list: [
        { id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }
    ],
    friends: [],
    events: [],
    missions: [],
    achievements: [],
    mail: [],
    notifications: []
};

// ============================================================================
// FUNÇÕES DE PROTOBUF
// ============================================================================
function readVarint(buffer, offset) {
    let result = 0n;
    let shift = 0n;
    let pos = offset;
    while (pos < buffer.length) {
        const byte = BigInt(buffer[pos]);
        result |= (byte & 0x7Fn) << shift;
        pos++;
        if ((byte & 0x80n) === 0n) return { value: result, offset: pos };
        shift += 7n;
    }
    throw new Error('Varint ultrapassou o fim do buffer');
}

function decodeProtobuf(buffer) {
    const obj = {};
    let offset = 0;
    const view = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    while (offset < view.length) {
        const tag = readVarint(view, offset);
        offset = tag.offset;
        const fieldNumber = Number(tag.value >> 3n);
        const wireType = Number(tag.value & 0x07n);
        if (wireType === 0) {
            const varint = readVarint(view, offset);
            obj[fieldNumber] = safeInt64(varint.value, 0);
            offset = varint.offset;
        } else if (wireType === 1) {
            if (offset + 8 > view.length) break;
            obj[fieldNumber] = view.readDoubleLE(offset);
            offset += 8;
        } else if (wireType === 5) {
            if (offset + 4 > view.length) break;
            obj[fieldNumber] = view.readFloatLE(offset);
            offset += 4;
        } else if (wireType === 2) {
            const lengthVarint = readVarint(view, offset);
            const length = Number(lengthVarint.value);
            offset = lengthVarint.offset;
            if (offset + length > view.length) break;
            const sub = view.slice(offset, offset + length);
            offset += length;
            try {
                const subObj = decodeProtobuf(sub);
                obj[fieldNumber] = Object.keys(subObj).length === 0 ? sub.toString('utf-8') : subObj;
            } catch (e) {
                obj[fieldNumber] = sub.toString('utf-8');
            }
        } else {
            break;
        }
    }
    return obj;
}

function safeInt64(value, defaultValue) {
    if (typeof value === 'bigint') {
        if (value > 9223372036854775807n || value < -9223372036854775808n) {
            const buf = Buffer.alloc(8);
            buf.writeBigInt64LE(value);
            return Number(buf.readBigInt64LE());
        }
        return Number(value);
    }
    if (typeof value === 'number') {
        if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
            const buf = Buffer.alloc(8);
            buf.writeBigInt64LE(BigInt(Math.floor(value)));
            return Number(buf.readBigInt64LE());
        }
        return value;
    }
    return defaultValue;
}

function encodeVarint(num) {
    const bytes = [];
    let value = BigInt(num);
    while (value > 0) {
        bytes.push(Number((value & 0x7Fn) | 0x80n));
        value >>= 7n;
    }
    if (bytes.length === 0) bytes.push(0);
    else bytes[bytes.length - 1] &= 0x7F;
    return Buffer.from(bytes);
}

function encodeProtobuf(obj) {
    const chunks = [];
    for (const key of Object.keys(obj)) {
        const fieldNumber = parseInt(key);
        if (isNaN(fieldNumber)) continue;
        const value = obj[key];
        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                const tag = (fieldNumber << 3) | 0;
                chunks.push(encodeVarint(tag), encodeVarint(value));
            } else {
                const tag = (fieldNumber << 3) | 1;
                chunks.push(encodeVarint(tag));
                const b = Buffer.alloc(8);
                b.writeDoubleLE(value);
                chunks.push(b);
            }
        } else if (typeof value === 'string') {
            const strBuf = Buffer.from(value, 'utf-8');
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(strBuf.length), strBuf);
        } else if (Buffer.isBuffer(value)) {
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(value.length), value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                const sub = encodeProtobuf(item);
                const tag = (fieldNumber << 3) | 2;
                chunks.push(encodeVarint(tag), encodeVarint(sub.length), sub);
            }
        } else if (typeof value === 'object' && value !== null) {
            const sub = encodeProtobuf(value);
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(sub.length), sub);
        }
    }
    return Buffer.concat(chunks);
}

// ============================================================================
// FUNÇÕES DE RESPOSTA COM MUITOS res.setHeader (estilo Barbosa)
// ============================================================================
function removeVercelHeaders(res) {
    const headersToRemove = [
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Headers',
        'Content-Encoding',
        'Transfer-Encoding',
        'X-Vercel-Cache',
        'X-Vercel-Id',
        'Cache-Control',
        'CDN-Cache-Control',
        'Vercel-CDN-Edge',
        'Vercel-CDN-Origin',
        'Server',
        'Via'
    ];
    headersToRemove.forEach(h => {
        if (res.hasHeader(h)) res.removeHeader(h);
    });
}

function applyCloudflareHeaders(res, contentType, contentLength) {
    // Remove headers automáticos
    removeVercelHeaders(res);
    // Adiciona os headers manualmente
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentLength);
    res.setHeader('alt-svc', 'h3=":443"; ma=86400');
    res.setHeader('cf-cache-status', 'DYNAMIC');
    // CF-RAY pode ser dinâmico; aqui usamos um fixo do print
    res.setHeader('CF-RAY', '9fe607862821941-001');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Nel', '{"report_to":"cf-nel","success_fraction":0.0,"max_age":604500}');
    res.setHeader('Report-To', '{"group":"cf-nel","max_age":604000,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4/5-6dPumpx7Rh41fzoaR5g%2BhX5gKZFJKXZHIYARAKATOMY"}]}');
    res.setHeader('Server', 'cloudflare');
    res.setHeader('Server-Timing', 'cfCacheStatus;desc="DYNAMIC", cfEdge;dur=4, cfOrigin;dur=27');
    res.setHeader('Date', new Date().toUTCString());
    // Evita compressão
    res.setHeader('Cache-Control', 'no-transform');
}

function jsonResponse(res, data, statusCode = 200) {
    const body = JSON.stringify(data);
    const buffer = Buffer.from(body, 'utf-8');
    applyCloudflareHeaders(res, 'application/json; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

function textResponse(res, text, statusCode = 200) {
    const buffer = Buffer.from(text, 'utf-8');
    applyCloudflareHeaders(res, 'text/plain; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

function xmlResponse(res, xml, statusCode = 200) {
    const buffer = Buffer.from(xml, 'utf-8');
    applyCloudflareHeaders(res, 'application/xml; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

function binaryResponse(res, buffer, statusCode = 200) {
    applyCloudflareHeaders(res, 'application/octet-stream', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

// ============================================================================
// E-MAIL LIMPO
// ============================================================================
function generateMailItem(id, title, sender, message) {
    return {
        id,
        title,
        sender,
        message,
        received: Math.floor(Date.now() / 1000),
        read: false,
        hasAttachment: false,
        attachmentItems: []
    };
}

const initialMail = [
    generateMailItem(1, 'Bem-vindo!', 'Equipe Private Server', 'Obrigado por jogar no servidor privado. Personagem padrão: Adam.'),
    generateMailItem(2, 'Dica do Dia', 'Sistema', 'Use o chat para conhecer outros jogadores.'),
    generateMailItem(3, 'Evento de Verão', 'Moderação', 'Participe do evento e ganhe Gold extra.')
];

// ============================================================================
// ADMIN
// ============================================================================
const ADMIN_USERNAME = 'dono133teste';
const ADMIN_PASSWORD = 'six seven';
const adminSessions = new Map();

function verifyAdmin(authHeader) {
    if (!authHeader) return false;
    const token = authHeader.replace('Bearer ', '');
    const session = adminSessions.get(token);
    return session && (Date.now() - session) < 3600000;
}

function generateToken(prefix) {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
}

// ============================================================================
// SERVIDOR HTTP
// ============================================================================
const server = http.createServer((req, res) => {
    // Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Content-Length': '0',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const route = parsedUrl.pathname;
    const query = parsedUrl.query;
    const now = Math.floor(Date.now() / 1000);

    try {
        // ------------------------------------------------------------------
        // VERSÃO (1.43.3)
        // ------------------------------------------------------------------
        if (route === '/live/ver.php' || route === '/live/appstoreversioninfo') {
            return textResponse(res, '1.43.3');
        }

        // ------------------------------------------------------------------
        // TOKEN DE CONVIDADO
        // ------------------------------------------------------------------
        if (route === '/oauth/guest/token/grant') {
            const accessToken = generateToken('acc');
            const data = {
                code: 0,
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 86400,
                openid: playerProgress.uid,
                nickname: playerProgress.nickname,
                uid: playerProgress.uid,
                account_id: playerProgress.uid,
                user_id: parseInt(playerProgress.uid),
                session_key: generateToken('sess'),
                ticket: generateToken('tick'),
                server_time: now,
                timestamp: now,
                is_guest: true,
                is_new_user: false,
                login_status: 1,
                region: "BR",
                lang: "pt-br",
                is_gm: false,
                gm_level: 0,
                show_test_btn: false,
                show_gm_panel: false,
                enable_console: false,
                country_code: "BR",
                force_to_restart_app: false,
                gdpr_version: 2,
                is_firewall_open: false,
                is_review_server: false,
                is_server_open: true,
                maintenance_announcement: "",
                remote_version: "1.43.0",
                version: "1.43.3",
                appstore: "googleplay",
                device: "android",
                platform: "android",
                character_id: 1,
                character_name: "Adam",
                character_skin_id: 0,
                character_skin_name: "",
                gold: playerProgress.gold,
                level: playerProgress.level,
                diamonds: playerProgress.diamonds,
                extra: extraPlayerData,
                friends: friendsList
            };
            cache.set(accessToken, Object.assign({}, playerProgress));
            return jsonResponse(res, data);
        }

        // ------------------------------------------------------------------
        // REGISTRO
        // ------------------------------------------------------------------
        if (route === '/oauth/guest/register') {
            const accessToken = generateToken('acc');
            const data = {
                code: 0,
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 86400,
                openid: playerProgress.uid,
                nickname: playerProgress.nickname,
                uid: playerProgress.uid,
                account_id: playerProgress.uid,
                user_id: parseInt(playerProgress.uid),
                session_key: generateToken('sess'),
                ticket: generateToken('tick'),
                server_time: now,
                timestamp: now,
                is_guest: true,
                is_new_user: true,
                login_status: 1,
                region: "BR",
                lang: "pt-br",
                is_gm: false,
                gm_level: 0,
                show_test_btn: false,
                show_gm_panel: false,
                enable_console: false,
                country_code: "BR",
                force_to_restart_app: false,
                gdpr_version: 2,
                is_firewall_open: false,
                is_review_server: false,
                is_server_open: true,
                maintenance_announcement: "Project teste beta",
                remote_version: "1.43.0",
                version: "1.43.3",
                appstore: "googleplay",
                device: "android",
                platform: "android",
                character_id: 1,
                character_name: "Adam",
                character_skin_id: 0,
                character_skin_name: "",
                gold: playerProgress.gold,
                level: playerProgress.level,
                diamonds: playerProgress.diamonds,
                extra: extraPlayerData,
                friends: friendsList
            };
            return jsonResponse(res, data);
        }

        // ------------------------------------------------------------------
        // OAUTH GENÉRICOS
        // ------------------------------------------------------------------
        const oauthRoutes = [
            '/oauth/login',
            '/oauth/logout',
            '/oauth/user/friends/inapp/get/v2',
            '/rebates/redeem',
            '/rebate/options/get',
            '/access.line.me/dialog/oauth/weblogin'
        ];
        if (oauthRoutes.includes(route)) {
            return jsonResponse(res, { code: 0, message: "SUCCESS" });
        }

        // ------------------------------------------------------------------
        // LOCALIZAÇÃO (traduções)
        // ------------------------------------------------------------------
        if (route.startsWith('/Localization/')) {
            return jsonResponse(res, {
                "LOBBY_PLAY": "JOGAR",
                "LOBBY_SETTINGS": "CONFIGURAÇÕES",
                "LOBBY_STORE": "LOJA",
                "CHARACTER_ADAM": "Adam"
            });
        }

        // ------------------------------------------------------------------
        // FACEBOOK SDK
        // ------------------------------------------------------------------
        if (route === '/.json') {
            return jsonResponse(res, {
                android_dialog_configs: {},
                android_sdk_error_categories: [],
                gdpv4_nux_content: {},
                gdpv4_nux_enabled: false,
                id: ":443",
                supports_implicit_sdk_logging: true
            });
        }

        // ------------------------------------------------------------------
        // CROSSDOMAIN
        // ------------------------------------------------------------------
        if (route === '/crossdomain.xml') {
            const xml = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>';
            return xmlResponse(res, xml);
        }

        // ------------------------------------------------------------------
        // PROTOBUF ENDPOINTS
        // ------------------------------------------------------------------
        if (route === '/GetDailyRankingReward') {
            const buffer = encodeProtobuf({ 1: [] });
            return binaryResponse(res, buffer);
        }
        if (route === '/GetMultiList') {
            const buffer = encodeProtobuf({ 1: [] });
            return binaryResponse(res, buffer);
        }
        if (route === '/GetPlatformFriendIDs') {
            const buffer = encodeProtobuf({ 1: [] });
            return binaryResponse(res, buffer);
        }

        // ------------------------------------------------------------------
        // NOTÍCIAS
        // ------------------------------------------------------------------
        if (route === '/GetActivityDesc') {
            return jsonResponse(res, {
                "1": [
                    {
                        id: "101",
                        title: "Evento de Verão",
                        description: "Participe e ganhe recompensas exclusivas!",
                        image: "https://cdn.barbosasmobile.com/news/summer.jpg",
                        start_time: now - 86400,
                        end_time: now + 86400 * 7,
                        url: "https://barbosasmobile.com/event/101",
                        weight: 1
                    },
                    {
                        id: "102",
                        title: "Atualização 1.43.3",
                        description: "Melhorias e tradução completa.",
                        image: "https://cdn.barbosasmobile.com/news/update.jpg",
                        start_time: now,
                        end_time: now + 86400 * 14,
                        url: "https://barbosasmobile.com/event/102",
                        weight: 2
                    }
                ],
                "2": {
                    id: "201",
                    title: "Destaque: Adam",
                    description: "O clássico Adam está de volta!",
                    image: "https://cdn.barbosasmobile.com/news/adam.jpg",
                    start_time: now,
                    end_time: now + 86400 * 30,
                    url: "https://barbosasmobile.com/feature/adam",
                    highlight: true
                }
            });
        }

        // ------------------------------------------------------------------
        // APP INFO
        // ------------------------------------------------------------------
        if (route === '/app/info/get') {
            return jsonResponse(res, {
                version: "1.43.3",
                server_url: DEFAULT_SETTINGS.server_url,
                cdn_url: DEFAULT_SETTINGS.cdn_url,
                force_update: false,
                maintenance: false,
                maintenance_msg: "",
                region: "BR",
                login_servers: [
                    { ip: "127.0.0.1", port: 60000, type: "lobby" },
                    { ip: "127.0.0.1", port: 60001, type: "matchmake" }
                ],
                available_channels: ["live"],
                news: {
                    android: "1.43.3 disponível!",
                    ios: "1.43.3 disponível!"
                }
            });
        }

        // ------------------------------------------------------------------
        // ROTA OCULTA
        // ------------------------------------------------------------------
        if (route === '/hidden/message') {
            const buffer = Buffer.from(mysteriousBytes);
            return binaryResponse(res, buffer);
        }

        // ------------------------------------------------------------------
        // ADMIN
        // ------------------------------------------------------------------
        if (route === '/admin/login') {
            if (req.method !== 'POST') {
                res.writeHead(405);
                return res.end('Method Not Allowed');
            }
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { username, password } = JSON.parse(body);
                    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
                        const token = generateToken('adm');
                        adminSessions.set(token, Date.now());
                        return jsonResponse(res, { success: true, token });
                    }
                    return jsonResponse(res, { success: false, message: 'Credenciais inválidas' }, 401);
                } catch (e) {
                    return jsonResponse(res, { success: false, message: 'JSON inválido' }, 400);
                }
            });
            return;
        }
        if (route === '/admin/update') {
            if (req.method !== 'POST') {
                res.writeHead(405);
                return res.end('Method Not Allowed');
            }
            const auth = req.headers.authorization;
            if (!verifyAdmin(auth)) {
                return jsonResponse(res, { error: 'Não autorizado' }, 403);
            }
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (typeof data.gold === 'number') playerProgress.gold = data.gold;
                    if (typeof data.level === 'number') playerProgress.level = data.level;
                    if (typeof data.diamonds === 'number') playerProgress.diamonds = data.diamonds;
                    if (typeof data.isBanned === 'boolean') playerProgress.isBanned = data.isBanned;
                    if (typeof data.banReason === 'string') playerProgress.banReason = data.banReason;
                    if (typeof data.nickname === 'string') playerProgress.nickname = data.nickname;
                    return jsonResponse(res, { success: true, player: playerProgress });
                } catch (e) {
                    return jsonResponse(res, { success: false, message: 'Erro no JSON' }, 400);
                }
            });
            return;
        }
        if (route === '/admin/status') {
            if (!verifyAdmin(req.headers.authorization)) {
                return jsonResponse(res, { error: 'Não autorizado' }, 403);
            }
            return jsonResponse(res, { server: 'online', players: 1, uptime: process.uptime(), playerProgress });
        }

        // ------------------------------------------------------------------
        // CATCH-ALL (configuração geral)
        // ------------------------------------------------------------------
        const mergedConfig = {
            ...DEFAULT_SETTINGS,
            version: query.version || '1.43.3',
            lang: query.lang || 'pt-br',
            device: query.device || 'android',
            appstore: query.appstore || 'googleplay',
            region: query.region || 'DEFAULT',
            account_id: query.account_id || playerProgress.uid,
            nickname: query.nickname || playerProgress.nickname,
            session_key: query.session_key || generateToken('sess'),
            access_token: query.access_token || generateToken('acc'),
            ticket: query.ticket || generateToken('tick'),
            openid: query.openid || playerProgress.uid,
            user_id: parseInt(query.user_id) || parseInt(playerProgress.uid),
            level: parseInt(query.level) || playerProgress.level,
            gold: parseInt(query.gold) || playerProgress.gold,
            diamonds: parseInt(query.diamonds) || playerProgress.diamonds,
            lobby_ip: query.lobby_ip || '127.0.0.1',
            lobby_port: parseInt(query.lobby_port) || 60000,
            matchmake_ip: query.matchmake_ip || '127.0.0.1',
            matchmake_port: parseInt(query.matchmake_port) || 60000,
            game_ip: query.game_ip || '127.0.0.1',
            game_port: parseInt(query.game_port) || 60000,
            server_time: now,
            timestamp: now,
            login_time: now,
            expires_in: 86400,
            expire_time: now + 86400,
            is_guest: true,
            is_new_user: false,
            login_status: 1,
            is_vip: false,
            is_gm: false,
            gm_level: 0,
            is_admin: false,
            is_tester: false,
            show_test_btn: false,
            show_gm_panel: false,
            enable_console: false,
            character_id: 1,
            character_name: 'Adam',
            character_skin_id: 0,
            character_skin_name: '',
            inventory: [],
            character_list: [{ id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }],
            friends: friendsList,
            events: [],
            missions: [],
            achievements: [],
            mail: initialMail,
            notifications: [],
            extra: extraPlayerData,
            config: {},
            features: {
                ranked: false,
                clan: false,
                battlepass: false,
                store: false,
                luck_royale: false,
                weapon_royale: false,
                events: true,
                missions: true,
                mail: true,
                friends: true,
                chat: true,
                news: true,
                settings: true
            },
            settings: {
                graphics_quality: "Padrão",
                frame_rate: "Normal",
                control_style: "2 Dedos",
                sensitivity: {
                    global: 50,
                    red_dot: 50,
                    scope_2x: 50,
                    scope_4x: 50,
                    sniper: 50,
                    free_look: 50
                },
                audio_master: 80,
                audio_sfx: 60,
                audio_voice: 40
            },
            debug: {}
        };
        return jsonResponse(res, mergedConfig);

    } catch (error) {
        const errorBody = JSON.stringify(DEFAULT_SETTINGS);
        const errorBuffer = Buffer.from(errorBody, 'utf-8');
        applyCloudflareHeaders(res, 'application/json; charset=utf-8', errorBuffer.length);
        res.writeHead(500);
        return res.end(errorBuffer);
    }
});

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
server.listen(PORT, () => {
    console.log(`Servidor privado rodando na porta ${PORT}`);
    console.log(`Personagem padrão: Adam (ID: 1)`);
    console.log(`Painel admin: /admin/login com usuário "${ADMIN_USERNAME}"`);
    console.log(`Versão: 1.43.3 (modo Barbosa)`);
});

module.exports = server;

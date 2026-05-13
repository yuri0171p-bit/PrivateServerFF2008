// main.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// ----------------------------- CONFIGURAÇÕES E AMBIENTE -----------------------------
const FIREBASE_LOGIN_URL = process.env.FIREBASE_LOGIN_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LOGIN_KEY = process.env.FIREBASE_LOGIN_KEY || '';
const FIREBASE_PLAYER_KEY = process.env.FIREBASE_AUTH_SECRET || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '6Lcbp2UsaAAAA0BkqpgXdbhvvduOkjU6kGfbnHS';

const FIREBASE_BASE_URL = process.env.FIREBASE_BASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';

const FIREBASE_URL = FIREBASE_PLAYER_URL;
const cache = new Map();
const CACHE_TTL = 60 * 1000;

// ----------------------------- FUNÇÕES AUXILIARES -----------------------------
function decodeProtobuf(buffer) {
    const result = {};
    let offset = 0;
    const MAX_INT64 = Math.pow(2, 63) - 1;
    while (offset < buffer.length) {
        const tag = buffer[offset++];
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x07;
        let value;
        if (wireType === 0) { // Varint
            let v = 0;
            let shift = 0;
            while (true) {
                const byte = buffer[offset++];
                v |= (byte & 0x7F) << shift;
                if ((byte & 0x80) === 0) break;
                shift += 7;
            }
            value = v > MAX_INT64 ? v - MAX_INT64 * 2 : v;
        } else if (wireType === 2) { // Length-delimited
            const length = buffer[offset++];
            const subBuffer = buffer.slice(offset, offset + length);
            offset += length;
            value = subBuffer;
        } else {
            break;
        }
        result[fieldNumber] = value;
    }
    return result;
}

function safeInt64(value, defaultValue = -1) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'object' && value.toNumber) return value.toNumber();
    const MAX_INT64 = Math.pow(2, 63) - 1;
    if (typeof value === 'number' && value > MAX_INT64) {
        return value - MAX_INT64 * 2;
    }
    return value;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Version, X-Api-Key');
}

function jsonResponse(res, data, statusCode = 200) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(body);
}

function textResponse(res, text, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(text);
}

function xmlResponse(res, xml, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(xml);
}

function removeVercelHeaders(res) {
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Methods');
    res.removeHeader('Content-Encoding');
    res.removeHeader('Transfer-Encoding');
    res.removeHeader('X-Vercel-Cache');
    res.removeHeader('X-Vercel-Ip');
    res.removeHeader('Server');
    res.setHeader('Server', 'Garena-Lobby-Server');
    res.setHeader('Connection', 'close');
}

// ----------------------------- CONSTANTES DE CONFIGURAÇÃO -----------------------------
const DEFAULT_SETTINGS = {
    appstore_url: 'https://discord.gg/projectreverger',
    billboard_msg: 'yhz o mais lindo',
    cdn_url: 'https://cdn.barbosasmobile.com/',
    code: 0,
    country_code: 'BR',
    force_to_restart_app: false,
    gdpr_version: 2,
    is_firewall_open: false,
    is_review_server: false,
    is_server_open: true,
    maintenance_announcement: 'Este projeto não faz afiliação com a garena.',
    remote_option_version: '1.0.0',
    remote_version: '1.25.3',
    server_url: 'https://private-serverffrevgab.vercel.app/'
};

// ----------------------------- SERVIDOR HTTP -----------------------------
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Content-Length': '0',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Version, X-Api-Key',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const route = parsedUrl.pathname;
    const now = Math.floor(Date.now() / 1000);

    try {
        // 1. Versão
        if (route === '/live/ver.php' || route === '/live/appstoreversioninfo') {
            return textResponse(res, '1.25.3');
        }

        // 2. Token de Convidado
        if (route === '/oauth/guest/token/grant') {
            const tokenResp = {
                code: 0,
                access_token: "yhzvip38_ks_Access_Token_2026!!",
                token_type: "Bearer",
                expires_in: 86400,
                openid: "99999999",
                nickname: "yhzvip38_ks",
                uid: "99999999",
                account_id: "99999999",
                user_id: 99999999,
                session_key: "yhzvip38_ks_Session_Key_2026!!",
                ticket: "yhzvip38_ks_Ticket_2026!!",
                server_time: now,
                timestamp: now,
                is_guest: true,
                is_new_user: false,
                login_status: 1,
                region: "BR",
                lang: "pt-br",
                is_gm: true,
                gm_level: 100,
                show_test_btn: true,
                show_gm_panel: true,
                enable_console: true,
                country_code: "BR",
                force_to_restart_app: false,
                gdpr_version: 2,
                is_firewall_open: false,
                is_review_server: false,
                is_server_open: true,
                maintenance_announcement: "",
                remote_version: "1.25.3",
                version: "1.25.3",
                appstore: "googleplay",
                device: "android",
                platform: "android"
            };
            return jsonResponse(res, tokenResp);
        }

        // 3. Registro de Convidado
        if (route === '/oauth/guest/register') {
            return jsonResponse(res, {
                code: 0,
                message: "SUCCESS",
                openid: "99999999",
                nickname: "yhzvip38_ks"
            });
        }

        // 4. Outras rotas OAuth
        const oauthRoutes = [
            '/oauth/login', '/oauth/logout', '/oauth/user/friends/inapp/get/v2',
            '/rebates/redeem', '/rebate/options/get', '/access.line.me/dialog/oauth/weblogin'
        ];
        if (oauthRoutes.includes(route)) {
            return jsonResponse(res, { code: 0, message: "SUCCESS" });
        }

        // 5. Localização
        if (route.startsWith('/Localization/')) {
            return jsonResponse(res, {});
        }

        // 6. Facebook SDK
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

        // 7. Crossdomain
        if (route === '/crossdomain.xml') {
            return xmlResponse(res, '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>');
        }

        // 8. GetDailyRankingReward
        if (route === '/GetDailyRankingReward') {
            return jsonResponse(res, { code: 0, reward: [] });
        }

        // 9. GetMultiList (resposta protobuf)
        if (route === '/GetMultiList') {
            const dummyBuffer = Buffer.from([0x08, 0x00]); // protobuf vazio
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', dummyBuffer.length);
            res.setHeader('Cache-Control', 'no-transform');
            removeVercelHeaders(res);
            res.writeHead(200);
            return res.end(dummyBuffer);
        }

        // 10. GetPlatformFriendIDs
        if (route === '/GetPlatformFriendIDs') {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', '0');
            res.writeHead(200);
            return res.end();
        }

        // 11. GetActivityDesc
        if (route === '/GetActivityDesc') {
            const newsList = [
                { title: "Nova Temporada", image_url: "https://example.com/img1.jpg", link_url: "", brief: "Comece já!", start_time: now, end_time: now + 86400 * 30, order_in_this_language: 1, region: "BR", language: "pt-BR" },
                { title: "Evento de Ouro", image_url: "https://example.com/img2.jpg", link_url: "", brief: "Ganhe mais ouro!", start_time: now, end_time: now + 86400 * 15, order_in_this_language: 2, region: "BR", language: "pt-BR" }
            ];
            const activityData = {
                "1": newsList.map(news => ({
                    "1": {
                        "1": news.language || "pt-BR",
                        "2": 1,
                        "3": news.title,
                        "5": news.image_url,
                        "7": news.image_url,
                        "8": news.link_url || "",
                        "9": news.brief || news.title,
                        "10": now,
                        "11": news.end_time || (now + 86400 * 30),
                        "12": news.region || "BR",
                        "13": 1,
                        "14": 1
                    }
                })),
                "2": {
                    "1": {
                        "1": "BR",
                        "2": "pt-BR",
                        "3": 1,
                        "4": newsList[0].title,
                        "5": 1,
                        "6": now,
                        "7": newsList[0].end_time || (now + 86400 * 30)
                    }
                }
            };
            return jsonResponse(res, activityData);
        }

        // 12. App Info
        if (route === '/app/info/get') {
            return jsonResponse(res, {
                code: 0,
                version: "1.25.3",
                remote_version: "1.25.3",
                appstore_url: "https://play.google.com/store/apps/details?id=com.dts.freefireth",
                cdn_url: "https://cdn.barbosasmobile.com/",
                is_server_open: true,
                server_url: "https://private-serverffrevgab.vercel.app/"
            });
        }

        // 13. Catch-all
        const query = parsedUrl.query;
        const config = {
            ...DEFAULT_SETTINGS,
            version: query.version || '1.25.3',
            lang: query.lang || 'pt-br',
            device: query.device || 'android',
            appstore: query.appstore || 'googleplay',
            region: query.region || 'DEFAULT',
            account_id: query.account_id || '99999999',
            nickname: query.nickname || 'yhzvip38_ks',
            session_key: query.session_key || 'yhzvip38_ks_Session_Key_2026!!',
            access_token: query.access_token || 'yhzvip38_ks_Access_Token_2026!!',
            ticket: query.ticket || 'yhzvip38_ks_Ticket_2026!!',
            openid: query.openid || '99999999',
            user_id: parseInt(query.user_id) || 99999999,
            level: parseInt(query.level) || 75,
            gold: parseInt(query.gold) || 9999999,
            diamond: parseInt(query.diamond) || 9999999,
            bp: parseInt(query.bp) || 9999999,
            vip_level: parseInt(query.vip_level) || 10,
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
            is_vip: true,
            is_gm: true,
            gm_level: 100,
            is_admin: true,
            is_tester: true,
            show_test_btn: true,
            show_gm_panel: true,
            enable_console: true,
            character_id: 101,
            character_name: 'Kelly',
            character_skin_id: 101001,
            character_skin_name: 'Kelly - Speed Run',
            inventory: [
                { item_id: 101, type: 'character', name: 'Kelly', skin_id: 101001, skin_name: 'Kelly - Speed Run', equipped: true, owned: true },
                { item_id: 201, type: 'weapon', name: 'M4A1', skin_id: 201001, skin_name: 'M4A1 - Dragon', equipped: true, owned: true }
            ],
            character_list: [
                { id: 101, name: 'Kelly', skin_id: 101001, skin_name: 'Kelly - Speed Run', equipped: true, owned: true }
            ],
            friends: [],
            events: [],
            missions: [],
            achievements: [],
            mail: [],
            notifications: [],
            config: {},
            features: {},
            settings: {},
            debug: {}
        };
        return jsonResponse(res, config);

    } catch (error) {
        console.error(error);
        res.writeHead(500);
        res.end('Internal Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = server;

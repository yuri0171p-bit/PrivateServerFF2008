const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Constantes do servidor
const PORT = process.env.PORT || 10000;
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LAYER_KEY = process.env.FIREBASE_AUTH_SECRET || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

// Cache simples (não utilizado diretamente, mas mantido por compatibilidade)
const cache = new Map();
const CACHE_TTL = 60000;

// --------------------------------------------------------------------
// Função auxiliar: decodeProtobuf(buffer)
// Simula a leitura de um buffer protobuf básico, retornando um objeto
// --------------------------------------------------------------------
function decodeProtobuf(buffer) {
    const obj = {};
    let offset = 0;
    const view = buffer instanceof Buffer ? buffer : Buffer.from(buffer);

    while (offset < view.length) {
        const tag = readVarint(view, offset);
        offset = tag.offset;
        const fieldNumber = tag.value >>> 3;
        const wireType = tag.value & 0x07;

        if (wireType === 0) { // Varint
            const varint = readVarint(view, offset);
            obj[fieldNumber] = safeInt64(varint.value, 0);
            offset = varint.offset;
        } else if (wireType === 1) { // 64-bit fixed (double or fixed64)
            obj[fieldNumber] = view.readDoubleLE(offset);
            offset += 8;
        } else if (wireType === 2) { // Length-delimited (string, bytes, embedded message)
            const lengthVarint = readVarint(view, offset);
            const length = lengthVarint.value;
            offset = lengthVarint.offset;
            const subBuffer = view.slice(offset, offset + length);
            offset += length;
            // Tenta decodificar como sub-mensagem ou string
            try {
                obj[fieldNumber] = decodeProtobuf(subBuffer);
            } catch (e) {
                obj[fieldNumber] = subBuffer.toString('utf-8');
            }
        } else if (wireType === 5) { // 32-bit fixed (float or fixed32)
            obj[fieldNumber] = view.readFloatLE(offset);
            offset += 4;
        } else {
            // Tipo desconhecido, pular
            break;
        }
    }
    return obj;
}

function readVarint(buffer, offset) {
    let result = 0;
    let shift = 0;
    while (offset < buffer.length) {
        const byte = buffer[offset];
        result |= (byte & 0x7F) << shift;
        offset++;
        if ((byte & 0x80) === 0) {
            return { value: result, offset };
        }
        shift += 7;
    }
    throw new Error('Varint ultrapassou o fim do buffer');
}

// --------------------------------------------------------------------
// safeInt64: converte para inteiro seguro, tratando complemento de dois
// --------------------------------------------------------------------
function safeInt64(value, defaultValue) {
    if (typeof value === 'number') {
        if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
            // Aproximação: considerar como signed 64-bit
            const buf = Buffer.alloc(8);
            buf.writeBigInt64LE(BigInt(value));
            return Number(buf.readBigInt64LE());
        }
        return value;
    }
    if (typeof value === 'bigint') {
        const max = BigInt('9223372036854775807');
        const min = BigInt('-9223372036854775808');
        if (value > max || value < min) {
            const buf = Buffer.alloc(8);
            buf.writeBigInt64LE(value);
            return Number(buf.readBigInt64LE());
        }
        return Number(value);
    }
    return defaultValue;
}

// --------------------------------------------------------------------
// Gerenciamento manual de CORS
// --------------------------------------------------------------------
function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function removeVercelHeaders(res) {
    const headersToRemove = [
        'Access-Control-Allow-Origin',
        'Content-Encoding',
        'Transfer-Encoding',
        'X-Vercel-Cache',
        'X-Vercel-Id',
        'X-Vercel-Execution-Region',
        'X-Vercel-Edge-Region',
        'X-Vercel-Proxy-Id',
        'X-Vercel-Sec',
        'X-Vercel-Worker',
        'Cache-Control',
        'CDN-Cache-Control',
        'Vercel-CDN-Edge',
        'Vercel-CDN-Origin',
        'Vercel-Cache',
        'Server',
        'Via'
    ];
    headersToRemove.forEach(header => {
        if (res.hasHeader(header)) {
            res.removeHeader(header);
        }
    });
}

// --------------------------------------------------------------------
// Helpers de resposta
// --------------------------------------------------------------------
function jsonResponse(res, data, statusCode = 200) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close'
    });
    res.end(body);
}

function textResponse(res, text, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close'
    });
    res.end(text);
}

function xmlResponse(res, xml, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close'
    });
    res.end(xml);
}

function binaryResponse(res, buffer, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length,
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close'
    });
    res.end(buffer);
}

// --------------------------------------------------------------------
// Definição do objeto DEFAULT_SETTINGS expandido
// --------------------------------------------------------------------
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
    server_url: 'https://private-serverffrevgab.vercel.app/',
    // Campos extras para compatibilidade
    version: '1.25.3',
    lang: 'pt-br',
    device: 'android',
    appstore: 'googleplay',
    region: 'DEFAULT',
    is_guest: true,
    is_new_user: false,
    login_status: 1,
    is_vip: true,
    is_gm: true,
    gm_level: 100,
    show_test_btn: true,
    show_gm_panel: true,
    enable_console: true,
    character_id: 101,
    character_name: 'Kelly',
    character_skin_id: 101001,
    character_skin_name: 'Kelly - Speed Run'
};

// --- Banco de dados estático de itens (inventário simulado) ---
const ITEM_DATABASE = [
    // Personagens
    { item_id: 101, type: 'character', name: 'Kelly', skin_id: 101001, skin_name: 'Kelly - Speed Run' },
    { item_id: 101, type: 'character', name: 'Kelly', skin_id: 101002, skin_name: 'Kelly - Sakura' },
    { item_id: 101, type: 'character', name: 'Kelly', skin_id: 101003, skin_name: 'Kelly - Dasher' },
    { item_id: 102, type: 'character', name: 'Hayato', skin_id: 102001, skin_name: 'Hayato - Fireband' },
    { item_id: 102, type: 'character', name: 'Hayato', skin_id: 102002, skin_name: 'Hayato - Bloodseeker' },
    { item_id: 103, type: 'character', name: 'Moco', skin_id: 103001, skin_name: 'Moco - Enigmatic' },
    { item_id: 104, type: 'character', name: 'Wukong', skin_id: 104001, skin_name: 'Wukong - Monkey King' },
    { item_id: 105, type: 'character', name: 'Maxim', skin_id: 105001, skin_name: 'Maxim - Chef' },
    { item_id: 106, type: 'character', name: 'Andrew', skin_id: 106001, skin_name: 'Andrew - Fierce' },
    { item_id: 107, type: 'character', name: 'Olivia', skin_id: 107001, skin_name: 'Olivia - Actress' },
    { item_id: 108, type: 'character', name: 'Paloma', skin_id: 108001, skin_name: 'Paloma - Royal Guard' },
    { item_id: 109, type: 'character', name: 'Miguel', skin_id: 109001, skin_name: 'Miguel - Slayer' },
    { item_id: 110, type: 'character', name: 'Caroline', skin_id: 110001, skin_name: 'Caroline - Cheerleader' },
    { item_id: 111, type: 'character', name: 'Steffie', skin_id: 111001, skin_name: 'Steffie - Sweet' },
    { item_id: 112, type: 'character', name: 'Antonio', skin_id: 112001, skin_name: 'Antonio - Gangster' },
    { item_id: 113, type: 'character', name: 'Laura', skin_id: 113001, skin_name: 'Laura - Cadet' },
    { item_id: 114, type: 'character', name: 'Rafael', skin_id: 114001, skin_name: 'Rafael - Deadly' },
    { item_id: 115, type: 'character', name: 'Alok', skin_id: 115001, skin_name: 'Alok - Booyah Day' },
    { item_id: 116, type: 'character', name: 'K', skin_id: 116001, skin_name: 'K - Captain' },
    { item_id: 117, type: 'character', name: 'Lila', skin_id: 117001, skin_name: 'Lila - Lab' },
    { item_id: 118, type: 'character', name: 'Clu', skin_id: 118001, skin_name: 'Clu - Contractor' },
    { item_id: 119, type: 'character', name: 'Dasha', skin_id: 119001, skin_name: 'Dasha - Soldier' },
    { item_id: 120, type: 'character', name: 'Jota', skin_id: 120001, skin_name: 'Jota - Surgeon' },
    // Armas
    { item_id: 201, type: 'weapon', name: 'M4A1', skin_id: 201001, skin_name: 'M4A1 - Dragon' },
    { item_id: 201, type: 'weapon', name: 'M4A1', skin_id: 201002, skin_name: 'M4A1 - Bloody Gold' },
    { item_id: 202, type: 'weapon', name: 'AK47', skin_id: 202001, skin_name: 'AK47 - Flames' },
    { item_id: 202, type: 'weapon', name: 'AK47', skin_id: 202002, skin_name: 'AK47 - Winterlands' },
    { item_id: 203, type: 'weapon', name: 'SCAR', skin_id: 203001, skin_name: 'SCAR - Megalodon' },
    { item_id: 204, type: 'weapon', name: 'MP40', skin_id: 204001, skin_name: 'MP40 - Cobra' },
    { item_id: 205, type: 'weapon', name: 'AWM', skin_id: 205001, skin_name: 'AWM - Sniper Elite' },
    { item_id: 206, type: 'weapon', name: 'Gatling', skin_id: 206001, skin_name: 'Gatling - Apocalypse' },
    { item_id: 207, type: 'weapon', name: 'M1887', skin_id: 207001, skin_name: 'M1887 - Western' },
    { item_id: 208, type: 'weapon', name: 'P90', skin_id: 208001, skin_name: 'P90 - Neon' },
    { item_id: 209, type: 'weapon', name: 'VSS', skin_id: 209001, skin_name: 'VSS - Mercenary' },
    { item_id: 210, type: 'weapon', name: 'M1014', skin_id: 210001, skin_name: 'M1014 - Shotgun King' },
    { item_id: 211, type: 'weapon', name: 'M60', skin_id: 211001, skin_name: 'M60 - Heavy' },
    { item_id: 212, type: 'weapon', name: 'M14', skin_id: 212001, skin_name: 'M14 - Marksman' },
    { item_id: 213, type: 'weapon', name: 'M1873', skin_id: 213001, skin_name: 'M1873 - Revolver' },
    { item_id: 214, type: 'weapon', name: 'G36', skin_id: 214001, skin_name: 'G36 - Tactical' },
    { item_id: 215, type: 'weapon', name: 'M249', skin_id: 215001, skin_name: 'M249 - LS' },
    { item_id: 216, type: 'weapon', name: 'AUG', skin_id: 216001, skin_name: 'AUG - Cyber' },
    { item_id: 217, type: 'weapon', name: 'M500', skin_id: 217001, skin_name: 'M500 - Magnum' },
    { item_id: 218, type: 'weapon', name: 'FAMAS', skin_id: 218001, skin_name: 'FAMAS - Predator' },
    { item_id: 219, type: 'weapon', name: 'MGL140', skin_id: 219001, skin_name: 'MGL140 - Launcher' },
    { item_id: 220, type: 'weapon', name: 'Treatment Gun', skin_id: 220001, skin_name: 'Treatment Gun - Medic' },
    // Colete e mochilas
    { item_id: 301, type: 'equipment', name: 'Colete Nível 2', skin_id: 301001, skin_name: 'Colete Básico' },
    { item_id: 302, type: 'equipment', name: 'Colete Nível 3', skin_id: 302001, skin_name: 'Colete Reforçado' },
    { item_id: 303, type: 'equipment', name: 'Mochila Nível 2', skin_id: 303001, skin_name: 'Mochila Padrão' },
    { item_id: 304, type: 'equipment', name: 'Mochila Nível 3', skin_id: 304001, skin_name: 'Mochila Tática' },
    { item_id: 305, type: 'equipment', name: 'Capacete Nível 2', skin_id: 305001, skin_name: 'Capacete Leve' },
    { item_id: 306, type: 'equipment', name: 'Capacete Nível 3', skin_id: 306001, skin_name: 'Capacete Pesado' },
    // Skins de veículos
    { item_id: 401, type: 'vehicle', name: 'Monstro', skin_id: 401001, skin_name: 'Monstro - Off-road' },
    { item_id: 402, type: 'vehicle', name: 'Moto', skin_id: 402001, skin_name: 'Moto - Rocket' },
    { item_id: 403, type: 'vehicle', name: 'Helicóptero', skin_id: 403001, skin_name: 'Helicóptero - Sky' },
    // Pets
    { item_id: 501, type: 'pet', name: 'Detective Panda', skin_id: 501001, skin_name: 'Panda Investigador' },
    { item_id: 502, type: 'pet', name: 'Robo', skin_id: 502001, skin_name: 'Robô Ajudante' },
    { item_id: 503, type: 'pet', name: 'Gato', skin_id: 503001, skin_name: 'Gato Sortudo' },
    { item_id: 504, type: 'pet', name: 'Falcão', skin_id: 504001, skin_name: 'Falcão Real' },
    { item_id: 505, type: 'pet', name: 'Lince', skin_id: 505001, skin_name: 'Lince das Neves' }
];

// Função para gerar inventário completo (todos os itens como possuídos)
function generateFullInventory() {
    return ITEM_DATABASE.map(item => ({
        ...item,
        owned: true,
        equipped: false
    }));
}

// Protobuf encoder simples para as respostas binárias
function encodeProtobuf(obj) {
    const chunks = [];
    for (const [key, value] of Object.entries(obj)) {
        const fieldNumber = parseInt(key);
        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                // varint
                const tag = (fieldNumber << 3) | 0;
                chunks.push(encodeVarint(tag));
                chunks.push(encodeVarint(value));
            } else {
                // double (fixed64)
                const tag = (fieldNumber << 3) | 1;
                chunks.push(encodeVarint(tag));
                const buf = Buffer.alloc(8);
                buf.writeDoubleLE(value);
                chunks.push(buf);
            }
        } else if (typeof value === 'string') {
            const strBuf = Buffer.from(value, 'utf-8');
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag));
            chunks.push(encodeVarint(strBuf.length));
            chunks.push(strBuf);
        } else if (Buffer.isBuffer(value)) {
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag));
            chunks.push(encodeVarint(value.length));
            chunks.push(value);
        } else if (typeof value === 'object') {
            const subMsg = encodeProtobuf(value);
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag));
            chunks.push(encodeVarint(subMsg.length));
            chunks.push(subMsg);
        }
    }
    return Buffer.concat(chunks);
}

function encodeVarint(num) {
    const bytes = [];
    let value = BigInt(num);
    while (value > 127) {
        bytes.push(Number((value & 0x7Fn) | 0x80n));
        value >>= 7n;
    }
    bytes.push(Number(value));
    return Buffer.from(bytes);
}

// --------------------------------------------------------------------
// Criação do servidor HTTP
// --------------------------------------------------------------------
const server = http.createServer((req, res) => {
    // Aplica CORS antes de qualquer coisa
    setCors(res);

    // Trata preflight OPTIONS
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

    // Remove headers indesejados automaticamente
    removeVercelHeaders(res);

    const parsedUrl = url.parse(req.url, true);
    const route = parsedUrl.pathname;
    const query = parsedUrl.query;
    const now = Math.floor(Date.now() / 1000);

    try {
        // Rota: Versão do app
        if (route === '/live/ver.php' || route === '/live/appstoreversioninfo') {
            return textResponse(res, '1.43.0');
        }

        // Rota: Token de convidado (grant)
        if (route === '/oauth/guest/token/grant') {
            const tokenData = {
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
                remote_version: "1.43.0",
                version: "1.43.0",
                appstore: "googleplay",
                device: "android",
                platform: "android"
            };
            return jsonResponse(res, tokenData);
        }

        // Rota: Registro de convidado
        if (route === '/oauth/guest/register') {
            const registerData = {
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
                maintenance_announcement: "Project teste beta",
                remote_version: "1.43.0",
                version: "1.43.0",
                appstore: "googleplay",
                device: "android",
                platform: "android"
            };
            return jsonResponse(res, registerData);
        }

        // Rotas OAuth genéricas
        const genericOauthRoutes = [
            '/oauth/login',
            '/oauth/logout',
            '/oauth/user/friends/inapp/get/v2',
            '/rebates/redeem',
            '/rebate/options/get',
            '/access.line.me/dialog/oauth/weblogin'
        ];
        if (genericOauthRoutes.includes(route)) {
            return jsonResponse(res, { code: 0, message: "SUCCESS" });
        }

        // Localização: retorna objeto vazio
        if (route.startsWith('/Localization/')) {
            return jsonResponse(res, {});
        }

        // Configuração do Facebook SDK
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

        // crossdomain.xml
        if (route === '/crossdomain.xml') {
            const xml = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>';
            return xmlResponse(res, xml);
        }

        // Ranking diário (protobuf)
        if (route === '/GetDailyRankingReward') {
            // Exemplo de resposta: mensagem com campo 1 = lista vazia
            const responseProto = encodeProtobuf({ 1: [] });
            return binaryResponse(res, responseProto);
        }

        // Lista múltipla (protobuf)
        if (route === '/GetMultiList') {
            const responseProto = encodeProtobuf({ 1: [] });
            return binaryResponse(res, responseProto);
        }

        // IDs de amigos da plataforma (protobuf)
        if (route === '/GetPlatformFriendIDs') {
            const responseProto = encodeProtobuf({ 1: [] });
            return binaryResponse(res, responseProto);
        }

        // Descrição de atividade (notícias e destaque)
        if (route === '/GetActivityDesc') {
            const activityDesc = {
                "1": [
                    {
                        id: "101",
                        title: "Booyah! Evento de Verão",
                        description: "Participe e ganhe recompensas exclusivas!",
                        image: "https://cdn.barbosasmobile.com/news/summer.jpg",
                        start_time: now - 86400,
                        end_time: now + 86400 * 7,
                        url: "https://barbosasmobile.com/event/101",
                        weight: 1
                    },
                    {
                        id: "102",
                        title: "Atualização 1.43.0",
                        description: "Novas armas e balanceamento.",
                        image: "https://cdn.barbosasmobile.com/news/update.jpg",
                        start_time: now - 43200,
                        end_time: now + 86400 * 14,
                        url: "https://barbosasmobile.com/event/102",
                        weight: 2
                    },
                    {
                        id: "103",
                        title: "Ranking Ranqueado",
                        description: "Suba de elo e ganhe prêmios.",
                        image: "https://cdn.barbosasmobile.com/news/ranked.jpg",
                        start_time: now - 86400 * 2,
                        end_time: now + 86400 * 30,
                        url: "https://barbosasmobile.com/event/103",
                        weight: 3
                    }
                ],
                "2": {
                    id: "201",
                    title: "Destaque: Nova Personagem",
                    description: "Conheça a Lila e suas habilidades.",
                    image: "https://cdn.barbosasmobile.com/news/lila_feature.jpg",
                    start_time: now,
                    end_time: now + 86400 * 10,
                    url: "https://barbosasmobile.com/feature/lila",
                    highlight: true
                }
            };
            return jsonResponse(res, activityDesc);
        }

        // Informações do app
        if (route === '/app/info/get') {
            const appInfo = {
                version: "1.43.0",
                server_url: "https://private-serverffrevgab.vercel.app/",
                cdn_url: "https://cdn.barbosasmobile.com/",
                force_update: false,
                maintenance: false,
                maintenance_msg: "",
                region: "BR",
                login_servers: [
                    { ip: "127.0.0.1", port: 60000, type: "lobby" },
                    { ip: "127.0.0.1", port: 60001, type: "matchmake" }
                ],
                available_channels: ["live", "beta"],
                news: {
                    android: "1.43.0 disponível!",
                    ios: "1.43.0 disponível!"
                }
            };
            return jsonResponse(res, appInfo);
        }

        // Catch-all: configuração principal com merge de query
        const mergedConfig = {
            ...DEFAULT_SETTINGS,
            version: query.version || '1.43.0',
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
            inventory: generateFullInventory(),
            character_list: ITEM_DATABASE.filter(i => i.type === 'character').map(i => ({
                ...i,
                owned: true,
                equipped: i.item_id === 101 && i.skin_id === 101001
            })),
            friends: [],
            events: [],
            missions: [],
            achievements: [],
            mail: [],
            notifications: [],
            config: {},
            features: {
                ranked: true,
                clan: true,
                battlepass: true,
                store: true,
                luck_royale: true,
                weapon_royale: true,
                events: true,
                missions: true,
                mail: true,
                friends: true,
                chat: true,
                news: true,
                settings: true
            },
            settings: {
                graphics_quality: "Ultra",
                frame_rate: "Ultra (120 FPS)",
                control_style: "4 Fingers",
                sensitivity: {
                    global: 100,
                    red_dot: 95,
                    scope_2x: 90,
                    scope_4x: 85,
                    sniper: 80,
                    free_look: 100
                },
                audio_master: 100,
                audio_sfx: 80,
                audio_voice: 60
            },
            debug: {
                enable_profiler: true,
                enable_network_log: false,
                enable_memory_tracker: false
            }
        };

        return jsonResponse(res, mergedConfig);

    } catch (error) {
        console.error('Erro na requisição:', error);
        return jsonResponse(res, DEFAULT_SETTINGS, 500);
    }
});

// --------------------------------------------------------------------
// Inicialização do servidor
// --------------------------------------------------------------------
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Firebase URL (mock): ${FIREBASE_PLAYER_URL}`);
    console.log(`Recaptcha (mock): ${RECAPTCHA_SECRET ? 'configurado' : 'não configurado'}`);
});

// Exportação do módulo
module.exports = server;

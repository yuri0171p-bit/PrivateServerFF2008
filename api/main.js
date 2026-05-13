const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ----------------------------------------------------------------------------------
// Constantes de ambiente
// ----------------------------------------------------------------------------------
const PORT = process.env.PORT || 10000;
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LAYER_KEY = process.env.FIREBASE_AUTH_SECRET || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

// ----------------------------------------------------------------------------------
// Cache em memória (para dados de sessão / tokens)
// ----------------------------------------------------------------------------------
const cache = new Map();
const CACHE_TTL = 60000; // 60 segundos

// ----------------------------------------------------------------------------------
// Função para ler varints de buffer (usada no decodeProtobuf)
// ----------------------------------------------------------------------------------
function readVarint(buffer, offset) {
    let result = 0n;
    let shift = 0n;
    let pos = offset;

    while (pos < buffer.length) {
        const byte = BigInt(buffer[pos]);
        result |= (byte & 0x7Fn) << shift;
        pos++;
        if ((byte & 0x80n) === 0n) {
            return { value: result, offset: pos };
        }
        shift += 7n;
    }
    throw new Error('Varint ultrapassou o fim do buffer');
}

// ----------------------------------------------------------------------------------
// Função auxiliar: decodeProtobuf (parser simplificado)
// Suporta os wire types: 0 (varint), 1 (64-bit), 2 (length-delimited), 5 (32-bit)
// ----------------------------------------------------------------------------------
function decodeProtobuf(buffer) {
    const obj = {};
    let offset = 0;
    const view = buffer instanceof Buffer ? buffer : Buffer.from(buffer);

    while (offset < view.length) {
        const tag = readVarint(view, offset);
        offset = tag.offset;
        const fieldNumber = Number(tag.value >> 3n);
        const wireType = Number(tag.value & 0x07n);

        if (wireType === 0) { // Varint
            const varint = readVarint(view, offset);
            obj[fieldNumber] = safeInt64(varint.value, 0);
            offset = varint.offset;
        } else if (wireType === 1) { // 64-bit (double ou fixed64)
            if (offset + 8 > view.length) break;
            const doubleVal = view.readDoubleLE(offset);
            obj[fieldNumber] = doubleVal;
            offset += 8;
        } else if (wireType === 5) { // 32-bit (float ou fixed32)
            if (offset + 4 > view.length) break;
            const floatVal = view.readFloatLE(offset);
            obj[fieldNumber] = floatVal;
            offset += 4;
        } else if (wireType === 2) { // Length-delimited
            const lengthVarint = readVarint(view, offset);
            const length = Number(lengthVarint.value);
            offset = lengthVarint.offset;
            if (offset + length > view.length) break;
            const subBuffer = view.slice(offset, offset + length);
            offset += length;
            // Tenta decodificar como sub-mensagem ou trata como bytes/string
            try {
                const subObj = decodeProtobuf(subBuffer);
                if (Object.keys(subObj).length === 0) {
                    obj[fieldNumber] = subBuffer.toString('utf-8');
                } else {
                    obj[fieldNumber] = subObj;
                }
            } catch (e) {
                obj[fieldNumber] = subBuffer.toString('utf-8');
            }
        } else {
            // Tipo desconhecido – tenta pular um varint (não recomendado, mas evita loop infinito)
            break;
        }
    }
    return obj;
}

// ----------------------------------------------------------------------------------
// safeInt64: converte BigInt ou number para inteiro seguro
// ----------------------------------------------------------------------------------
function safeInt64(value, defaultValue) {
    if (typeof value === 'bigint') {
        if (value > 9223372036854775807n || value < -9223372036854775808n) {
            // Além do intervalo seguro, faz a conversão manual
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

// ----------------------------------------------------------------------------------
// Gerenciamento manual de CORS
// ----------------------------------------------------------------------------------
function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Remove headers típicos do Vercel que podem causar problemas
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

// ----------------------------------------------------------------------------------
// Configurações padrão de headers
// ----------------------------------------------------------------------------------
const DEFAULT_HEADERS = {
    'Server': 'Garena-Lobby-Server',
    'Connection': 'close'
};

// ----------------------------------------------------------------------------------
// Helpers de resposta HTTP
// ----------------------------------------------------------------------------------
function jsonResponse(res, data, statusCode = 200) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function textResponse(res, text, statusCode = 200) {
    res.writeHead(statusCode, {
        ...DEFAULT_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text)
    });
    res.end(text);
}

function xmlResponse(res, xml, statusCode = 200) {
    res.writeHead(statusCode, {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml)
    });
    res.end(xml);
}

function binaryResponse(res, buffer, statusCode = 200) {
    const len = buffer.length;
    res.writeHead(statusCode, {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/octet-stream',
        'Content-Length': len
    });
    res.end(buffer);
}

// ----------------------------------------------------------------------------------
// Simulação de persistência via Firebase (em memória, apenas ouro e level do Adam)
// ----------------------------------------------------------------------------------
let playerProgress = {
    gold: 1000,
    level: 1,
    uid: '99999999'
};

function updateProgress(gold, level) {
    playerProgress.gold = gold;
    playerProgress.level = level;
    // Aqui seria a chamada real ao Firebase: firebaseRef.child(uid).update({gold, level})
}

// ----------------------------------------------------------------------------------
// Configuração DEFAULT_SETTINGS (versão simplificada, apenas Adam)
// ----------------------------------------------------------------------------------
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
    remote_version: '1.25.3',
    server_url: 'https://versionscommon.barbosasmobile.com/live/',
    version: '1.25.3',
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
    // Personagem único: Adam (ID 1), sem skins
    character_id: 1,
    character_name: 'Adam',
    character_skin_id: 0,
    character_skin_name: '',
    // Inventário e listas vazias (apenas Adam estará na lista de personagens)
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

// ----------------------------------------------------------------------------------
// Estrutura de e-mail simples (substituindo as mensagens gigantes do Barbosa)
// ----------------------------------------------------------------------------------
function generateMailItem(id, title, sender, message, received) {
    return {
        id: id,
        title: title,
        sender: sender,
        message: message,
        received: received,
        read: false,
        hasAttachment: false,
        attachmentItems: []
    };
}

// Exemplo de e-mails iniciais
const initialMail = [
    generateMailItem(1, 'Bem-vindo!', 'Equipe Private Server', 'Bem-vindo ao servidor privado de Free Fire 2018! Aproveite a estadia.', Math.floor(Date.now() / 1000)),
    generateMailItem(2, 'Dica do Dia', 'Sistema', 'Jogue com amigos para ganhar mais experiência.', Math.floor(Date.now() / 1000) - 3600)
];

// ----------------------------------------------------------------------------------
// Codificação Protobuf simples (para respostas binárias)
// ----------------------------------------------------------------------------------
function encodeVarint(num) {
    const bytes = [];
    let value = BigInt(num);
    while (value > 0) {
        bytes.push(Number((value & 0x7Fn) | 0x80n));
        value >>= 7n;
    }
    if (bytes.length === 0) {
        bytes.push(0);
    } else {
        bytes[bytes.length - 1] &= 0x7F;
    }
    return Buffer.from(bytes);
}

function encodeProtobuf(obj) {
    const chunks = [];
    const keys = Object.keys(obj);
    for (const key of keys) {
        const fieldNumber = parseInt(key);
        if (isNaN(fieldNumber)) continue;
        const value = obj[key];

        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                // Wire type 0 (varint)
                const tag = (fieldNumber << 3) | 0;
                chunks.push(encodeVarint(tag));
                chunks.push(encodeVarint(value));
            } else {
                // Wire type 1 (double)
                const tag = (fieldNumber << 3) | 1;
                chunks.push(encodeVarint(tag));
                const buf = Buffer.alloc(8);
                buf.writeDoubleLE(value);
                chunks.push(buf);
            }
        } else if (typeof value === 'string') {
            const strBuffer = Buffer.from(value, 'utf-8');
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag));
            chunks.push(encodeVarint(strBuffer.length));
            chunks.push(strBuffer);
        } else if (Buffer.isBuffer(value)) {
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag));
            chunks.push(encodeVarint(value.length));
            chunks.push(value);
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                // Para arrays, codificar como submensagens repetidas (campo com label repeated)
                for (const item of value) {
                    const subMsg = encodeProtobuf(item);
                    const tag = (fieldNumber << 3) | 2;
                    chunks.push(encodeVarint(tag));
                    chunks.push(encodeVarint(subMsg.length));
                    chunks.push(subMsg);
                }
            } else {
                const subMsg = encodeProtobuf(value);
                const tag = (fieldNumber << 3) | 2;
                chunks.push(encodeVarint(tag));
                chunks.push(encodeVarint(subMsg.length));
                chunks.push(subMsg);
            }
        }
    }
    return Buffer.concat(chunks);
}

// ----------------------------------------------------------------------------------
// Função para geração de tokens simples (base64)
// ----------------------------------------------------------------------------------
function generateToken(type) {
    const randomBytes = Buffer.from(Math.random().toString(36).substring(2, 15)).toString('base64');
    return `${type}_${randomBytes}_${Date.now()}`;
}

// ----------------------------------------------------------------------------------
// Tratamento centralizado de erros
// ----------------------------------------------------------------------------------
function handleError(res, error) {
    console.error('Erro:', error.message);
    const errorBody = JSON.stringify({ code: 500, message: 'Erro interno do servidor' });
    res.writeHead(500, {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(errorBody)
    });
    res.end(errorBody);
}

// ----------------------------------------------------------------------------------
// Criação do servidor HTTP
// ----------------------------------------------------------------------------------
const server = http.createServer((req, res) => {
    // Configura CORS manual
    setCors(res);
    removeVercelHeaders(res);

    // Tratamento de requisições OPTIONS (preflight)
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
        // ------------------------------------------------------------------------------
        // Rotas de versão
        // ------------------------------------------------------------------------------
        if (route === '/live/ver.php' || route === '/live/appstoreversioninfo') {
            return textResponse(res, '1.25.3');
        }

        // ------------------------------------------------------------------------------
        // Autenticação: token de convidado
        // ------------------------------------------------------------------------------
        if (route === '/oauth/guest/token/grant') {
            const accessToken = generateToken('acc');
            const tokenData = {
                code: 0,
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 86400,
                openid: playerProgress.uid,
                nickname: "Player",
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
                remote_version: "1.25.3",
                version: "1.25.3",
                appstore: "googleplay",
                device: "android",
                platform: "android",
                // Dados do personagem único
                character_id: 1,
                character_name: "Adam",
                character_skin_id: 0,
                character_skin_name: "",
                gold: playerProgress.gold,
                level: playerProgress.level
            };
            // Atualiza cache do token
            cache.set(accessToken, Object.assign({}, playerProgress));
            return jsonResponse(res, tokenData);
        }

        // ------------------------------------------------------------------------------
        // Registro de convidado (similar ao token grant)
        // ------------------------------------------------------------------------------
        if (route === '/oauth/guest/register') {
            const accessToken = generateToken('acc');
            const registerData = {
                code: 0,
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 86400,
                openid: playerProgress.uid,
                nickname: "Player",
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
                maintenance_announcement: "Project teste beta",
                remote_version: "1.25.3",
                version: "1.25.3",
                appstore: "googleplay",
                device: "android",
                platform: "android",
                character_id: 1,
                character_name: "Adam",
                character_skin_id: 0,
                character_skin_name: "",
                gold: playerProgress.gold,
                level: playerProgress.level
            };
            return jsonResponse(res, registerData);
        }

        // ------------------------------------------------------------------------------
        // Rotas OAuth secundárias
        // ------------------------------------------------------------------------------
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

        // ------------------------------------------------------------------------------
        // Localização
        // ------------------------------------------------------------------------------
        if (route.startsWith('/Localization/')) {
            return jsonResponse(res, {});
        }

        // ------------------------------------------------------------------------------
        // Configuração Facebook SDK
        // ------------------------------------------------------------------------------
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

        // ------------------------------------------------------------------------------
        // crossdomain.xml
        // ------------------------------------------------------------------------------
        if (route === '/crossdomain.xml') {
            const xmlContent = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>';
            return xmlResponse(res, xmlContent);
        }

        // ------------------------------------------------------------------------------
        // Endpoints de ranking e amigos (respostas binárias com protobuf)
        // ------------------------------------------------------------------------------
        if (route === '/GetDailyRankingReward') {
            // Resposta: mensagem vazia ou com uma estrutura simples
            const protoObj = { 1: [] }; // Campo 1 com array vazio
            const buffer = encodeProtobuf(protoObj);
            return binaryResponse(res, buffer);
        }

        if (route === '/GetMultiList') {
            const protoObj = { 1: [] };
            const buffer = encodeProtobuf(protoObj);
            return binaryResponse(res, buffer);
        }

        if (route === '/GetPlatformFriendIDs') {
            const protoObj = { 1: [] };
            const buffer = encodeProtobuf(protoObj);
            return binaryResponse(res, buffer);
        }

        // ------------------------------------------------------------------------------
        // Descrição de atividade (notícias)
        // ------------------------------------------------------------------------------
        if (route === '/GetActivityDesc') {
            const activityDesc = {
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
                        title: "Atualização 1.25.3",
                        description: "Melhorias de desempenho.",
                        image: "https://cdn.barbosasmobile.com/news/update.jpg",
                        start_time: now - 43200,
                        end_time: now + 86400 * 14,
                        url: "https://barbosasmobile.com/event/102",
                        weight: 2
                    }
                ],
                "2": {
                    id: "201",
                    title: "Destaque: Adam",
                    description: "Jogue com o personagem clássico Adam.",
                    image: "https://cdn.barbosasmobile.com/news/adam.jpg",
                    start_time: now,
                    end_time: now + 86400 * 30,
                    url: "https://barbosasmobile.com/feature/adam",
                    highlight: true
                }
            };
            return jsonResponse(res, activityDesc);
        }

        // ------------------------------------------------------------------------------
        // Informações do app
        // ------------------------------------------------------------------------------
        if (route === '/app/info/get') {
            const appInfo = {
                version: "1.25.3",
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
                    android: "1.25.3 disponível!",
                    ios: "1.25.3 disponível!"
                }
            };
            return jsonResponse(res, appInfo);
        }

        // ------------------------------------------------------------------------------
        // Catch-all: Configuração completa (merge da query com DEFAULT_SETTINGS)
        // ------------------------------------------------------------------------------
        const mergedConfig = {
            ...DEFAULT_SETTINGS,
            version: query.version || '1.25.3',
            lang: query.lang || 'pt-br',
            device: query.device || 'android',
            appstore: query.appstore || 'googleplay',
            region: query.region || 'DEFAULT',
            account_id: query.account_id || playerProgress.uid,
            nickname: query.nickname || 'Player',
            session_key: query.session_key || generateToken('sess'),
            access_token: query.access_token || generateToken('acc'),
            ticket: query.ticket || generateToken('tick'),
            openid: query.openid || playerProgress.uid,
            user_id: parseInt(query.user_id) || parseInt(playerProgress.uid),
            level: parseInt(query.level) || playerProgress.level,
            gold: parseInt(query.gold) || playerProgress.gold,
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
            character_list: [
                { id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }
            ],
            friends: [],
            events: [],
            missions: [],
            achievements: [],
            mail: initialMail,
            notifications: [],
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
        handleError(res, error);
    }
});

// ----------------------------------------------------------------------------------
// Inicialização do servidor
// ----------------------------------------------------------------------------------
server.listen(PORT, () => {
    console.log(`Servidor privado rodando na porta ${PORT}`);
    console.log(`Personagem padrão: Adam (ID: 1)`);
    console.log(`Persistência de dados (ouro, level) armazenada em memória.`);
    console.log(`Firebase URL (mock): ${FIREBASE_PLAYER_URL}`);
});

module.exports = server;

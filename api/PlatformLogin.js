/*
 * ============================================================================
 * api/PlatformLogin.js - Handler para MajorLogin e PlatformLogin (v1.24+)
 * ============================================================================
 *
 * Este módulo responde às requisições de login binário (Protobuf) do Free Fire.
 * Ele gera uma resposta codificada com os dados do jogador, incluindo tokens,
 * informações de servidor, progresso (gold, level, exp) e URLs de conexão.
 *
 * Compatível com as versões antigas (1.24) que utilizam o fluxo MajorLogin.
 *
 * Rotas gerenciadas (via vercel.json):
 *   /PlatformLogin
 *   /MajorLogin
 *   /api/PlatformLogin
 *
 * Protocolo: Protobuf binário (application/octet-stream)
 *
 * Dependências:
 *   - crypto (nativo)
 *   - https (nativo, para Firebase)
 *
 * ============================================================================
 */

'use strict';

// ===========================================================================
// IMPORTAÇÃO DE MÓDULOS
// ===========================================================================
const https = require('https');
const crypto = require('crypto');

// ===========================================================================
// CONFIGURAÇÕES DO FIREBASE (REALTIME DATABASE)
// ===========================================================================

/**
 * URL base do Firebase Realtime Database.
 * Pode ser sobrescrita pela variável de ambiente FIREBASE_DATABASE_URL.
 */
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL ||
    'https://project-store-47172-default-rtdb.firebaseio.com';

/**
 * URL de login (geralmente a mesma do Realtime Database).
 */
const FIREBASE_LOGIN_URL = process.env.FIREBASE_LOGIN_URL ||
    'https://project-store-47172-default-rtdb.firebaseio.com';

/**
 * Chave de login (opcional, para autenticação).
 */
const FIREBASE_LOGIN_KEY = process.env.FIREBASE_LOGIN_KEY || '';

/**
 * Chave secreta do Firebase Auth (para operações privilegiadas).
 */
const FIREBASE_PLAYERTKEY = process.env.FIREBASE_AUTH_SECRET || '';

/**
 * URL base alternativa para outras operações.
 */
const FIREBASE_BASE_URL = process.env.FIREBASE_BASE_URL ||
    'https://project-store-47172-default-rtdb.firebaseio.com';

/**
 * Segredo genérico do Firebase (não utilizado diretamente aqui, mas mantido).
 */
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';

/**
 * Alias para a URL principal.
 */
const FIREBASE_URL = FIREBASE_PLAYER_URL;

// ===========================================================================
// SISTEMA DE CACHE EM MEMÓRIA
// ===========================================================================

/**
 * Cache para armazenar respostas frequentemente acessadas.
 * Chave: string identificadora.
 * Valor: { data: any, timestamp: number }
 */
const responseCache = new Map();

/**
 * Tempo de vida do cache (em milissegundos). Padrão: 1 minuto.
 */
const CACHE_TTL = 60 * 1000;

/**
 * Armazena um valor no cache.
 *
 * @param {string} key - Chave única.
 * @param {any} data - Dados a serem cacheados.
 */
function cacheSet(key, data) {
    responseCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

/**
 * Recupera um valor do cache, se ainda válido.
 *
 * @param {string} key - Chave do cache.
 * @returns {any|null} Dados cacheados ou null.
 */
function cacheGet(key) {
    const entry = responseCache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.timestamp) >= CACHE_TTL) {
        responseCache.delete(key);
        return null;
    }
    return entry.data;
}

// ===========================================================================
// FUNÇÕES AUXILIARES DE PROTOBUF
// ===========================================================================

/**
 * Codifica um número inteiro como Varint (unsigned LEB128).
 *
 * @param {number|bigint} num - Número a codificar.
 * @returns {Buffer} Buffer contendo o varint.
 */
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
        // Limpa o bit de continuação no último byte.
        bytes[bytes.length - 1] &= 0x7F;
    }
    return Buffer.from(bytes);
}

/**
 * Codifica um objeto JavaScript para o formato Protobuf.
 *
 * Suporta:
 *   - Números inteiros (wire type 0)
 *   - Números de ponto flutuante (wire type 1 - double)
 *   - Strings (wire type 2)
 *   - Buffers (wire type 2)
 *   - Objetos aninhados (wire type 2, sub-mensagem)
 *   - Arrays (repetidos, cada item como sub-mensagem)
 *
 * @param {object} obj - Objeto a ser codificado (chaves numéricas).
 * @returns {Buffer} Payload Protobuf.
 */
function encodeProtobuf(obj) {
    const chunks = [];
    for (const key of Object.keys(obj)) {
        const fieldNumber = parseInt(key);
        if (isNaN(fieldNumber)) continue;
        const value = obj[key];

        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                // Wire type 0 (varint)
                const tag = (fieldNumber << 3) | 0;
                chunks.push(encodeVarint(tag), encodeVarint(value));
            } else {
                // Wire type 1 (double)
                const tag = (fieldNumber << 3) | 1;
                chunks.push(encodeVarint(tag));
                const b = Buffer.alloc(8);
                b.writeDoubleLE(value);
                chunks.push(b);
            }
        } else if (typeof value === 'string') {
            // Wire type 2 (length-delimited)
            const strBuf = Buffer.from(value, 'utf-8');
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(strBuf.length), strBuf);
        } else if (Buffer.isBuffer(value)) {
            // Wire type 2 (bytes)
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(value.length), value);
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                // Campos repetidos: cada item é uma sub-mensagem com a mesma tag.
                for (const item of value) {
                    const sub = encodeProtobuf(item);
                    const tag = (fieldNumber << 3) | 2;
                    chunks.push(encodeVarint(tag), encodeVarint(sub.length), sub);
                }
            } else {
                // Sub-mensagem única.
                const sub = encodeProtobuf(value);
                const tag = (fieldNumber << 3) | 2;
                chunks.push(encodeVarint(tag), encodeVarint(sub.length), sub);
            }
        }
    }
    return Buffer.concat(chunks);
}

// ===========================================================================
// DADOS DO JOGADOR (FICTÍCIOS, MAS FIÉIS AO PROTOCOLO ORIGINAL)
// ===========================================================================

/**
 * ID de conta fixo (pode ser dinâmico no futuro).
 */
const FAKE_ACCOUNT_ID = 10021659;

/**
 * Timestamp atual (será recalculado a cada requisição).
 */
function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}

/**
 * Gera um token aleatório com prefixo.
 *
 * @param {string} prefix - Prefixo do token.
 * @returns {string} Token gerado.
 */
function generateToken(prefix) {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
}

/**
 * Constrói o objeto de resposta Protobuf com os dados do jogador.
 *
 * @returns {object} Objeto pronto para ser codificado.
 */
function buildResponseObject() {
    const now = getCurrentTimestamp();
    return {
        1: FAKE_ACCOUNT_ID,                              // account ID
        3: "BR",                                         // região
        4: "kaliTeAma Neymar",                         // nickname
        5: 1761013131,                                   // criação da conta (timestamp)
        6: 100,                                          // level
        7: 250000,                                       // gold/coins
        8: 1,                                            // diamonds/gems
        10: 5600,                                        // exp
        14: "93.127.212.208:16700",                      // chat server
        15: 1,                                           // ?
        16: "https://private-serverffapigab.vercel.app",  // server url
        17: generateToken('acc'),                        // access token (dinâmico)
        18: 3600,                                        // ttl
        19: { 1: 1, 2: "BR" },                           // sub-objeto (ex.: região)
        20: 0,                                           // ?
        21: "BR",                                        // região notificação
        22: "BR",                                        // ?
        23: now,                                         // timestamp atual
        24: "BR",                                        // ?
        25: 1,                                           // ?
        32: "192.168.0.7:80"                             // servidor secundário?
    };
}

// ===========================================================================
// FUNÇÕES DE ACESSO AO FIREBASE (SIMULAÇÃO)
// ===========================================================================

/**
 * Busca dados de um caminho no Firebase Realtime Database.
 * Atualmente retorna um objeto vazio, mas pode ser expandido.
 *
 * @param {string} path - Caminho no banco (ex.: 'players/10021659').
 * @returns {Promise<object>} Dados do Firebase.
 */
function fetchFromFirebase(path) {
    return new Promise((resolve) => {
        const url = `${FIREBASE_URL}/${path}.json`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data || {});
                } catch (e) {
                    resolve({});
                }
            });
        }).on('error', (err) => {
            console.error(`[Firebase] Erro ao buscar ${path}:`, err.message);
            resolve({});
        });
    });
}

// ===========================================================================
// UTILITÁRIOS DE LOG
// ===========================================================================

/**
 * Formata e exibe uma mensagem de log com timestamp.
 *
 * @param {string} level - Nível do log (INFO, WARN, ERROR).
 * @param {string} message - Mensagem a ser exibida.
 */
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// ===========================================================================
// TRATAMENTO DE ERROS CENTRALIZADO
// ===========================================================================

/**
 * Envia uma resposta de erro genérica.
 *
 * @param {object} res - Objeto de resposta HTTP.
 * @param {number} statusCode - Código HTTP.
 * @param {string} message - Mensagem de erro.
 */
function sendError(res, statusCode, message) {
    log('ERROR', `${statusCode} - ${message}`);
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end(message);
}

// ===========================================================================
// HANDLER PRINCIPAL
// ===========================================================================

/**
 * Função principal exportada para o Vercel.
 * Processa requisições POST (MajorLogin/PlatformLogin) e retorna
 * um payload Protobuf com os dados do jogador.
 *
 * @param {object} req - Requisição HTTP.
 * @param {object} res - Resposta HTTP.
 */
module.exports = async (req, res) => {
    // ------------------------------------------------------------------------
    // 1. CONFIGURAÇÃO DE CORS
    // ------------------------------------------------------------------------
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // ------------------------------------------------------------------------
    // 2. RESPOSTA PARA PREFLIGHT (OPTIONS)
    // ------------------------------------------------------------------------
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ------------------------------------------------------------------------
    // 3. VALIDAÇÃO DO MÉTODO HTTP
    // ------------------------------------------------------------------------
    if (req.method !== 'POST') {
        sendError(res, 405, 'Method Not Allowed');
        return;
    }

    // ------------------------------------------------------------------------
    // 4. PROCESSAMENTO DA REQUISIÇÃO
    // ------------------------------------------------------------------------
    try {
        log('INFO', `Requisição recebida de ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);

        // --- 4.1. Verificar cache (evita recodificar a mesma resposta) ---
        const cacheKey = 'platform_login_response';
        let responseBuffer = cacheGet(cacheKey);

        if (responseBuffer) {
            log('INFO', 'Resposta obtida do cache.');
        } else {
            // --- 4.2. Construir o objeto de resposta ---
            const responseObject = buildResponseObject();

            // --- 4.3. Codificar para Protobuf ---
            responseBuffer = encodeProtobuf(responseObject);
            log('INFO', `Resposta codificada (${responseBuffer.length} bytes).`);

            // --- 4.4. Armazenar no cache ---
            cacheSet(cacheKey, responseBuffer);
        }

        // --------------------------------------------------------------------
        // 5. ENVIO DA RESPOSTA BINÁRIA
        // --------------------------------------------------------------------
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', responseBuffer.length);
        res.setHeader('Server', 'Garena-Lobby-Server');
        res.setHeader('Connection', 'close');
        res.writeHead(200);
        res.end(responseBuffer);

        log('INFO', 'Resposta enviada com sucesso.');
    } catch (error) {
        // --------------------------------------------------------------------
        // 6. TRATAMENTO DE ERROS INESPERADOS
        // --------------------------------------------------------------------
        log('ERROR', `Erro interno: ${error.message}`);
        log('ERROR', error.stack);
        sendError(res, 500, 'Internal Server Error');
    }
};

// ===========================================================================
// EXPORTAÇÃO ADICIONAL (útil para testes e depuração)
// ===========================================================================

/**
 * Permite que outros módulos invalidem o cache manualmente.
 */
module.exports.clearCache = function () {
    responseCache.clear();
    log('INFO', 'Cache limpo manualmente.');
};

/**
 * Expõe a função de geração de token para uso externo.
 */
module.exports.generateToken = generateToken;

// ===========================================================================
// FIM DO ARQUIVO
// ===========================================================================

const https = require('https');

// ===========================================================================
// CONFIGURAÇÕES GLOBAIS
// ===========================================================================

/**
 * URL base do Firebase Realtime Database.
 * Certifique-se de que este projeto exista e esteja configurado corretamente.
 */
const FIREBASE_URL = 'https://union2018-default-rtdb.firebaseio.com/';

/**
 * Tempo de vida do cache em milissegundos (1 minuto).
 * Reduz o número de requisições ao Firebase e melhora o desempenho.
 */
const CACHE_TTL = 60 * 1000;

/**
 * Prefixo para chaves do cache a fim de evitar colisões com outros módulos.
 */
const CACHE_PREFIX = 'ver_js_';

// ===========================================================================
// SISTEMA DE CACHE
// ===========================================================================

/**
 * Mapa utilizado como cache em memória.
 * Chave: string (ex: 'ver_js_firebase_/config')
 * Valor: objeto { data: object, timestamp: number }
 */
const cache = new Map();

/**
 * Armazena um valor no cache com timestamp atual.
 *
 * @param {string} key - Chave única para o cache
 * @param {object} data - Dados a serem armazenados
 */
function cacheSet(key, data) {
    cache.set(CACHE_PREFIX + key, {
        data: data,
        timestamp: Date.now()
    });
}

/**
 * Recupera um valor do cache se ainda for válido.
 *
 * @param {string} key - Chave do cache
 * @returns {object|null} Dados armazenados ou null se expirado/inexistente
 */
function cacheGet(key) {
    const entry = cache.get(CACHE_PREFIX + key);
    if (!entry) {
        return null;
    }
    // Verifica se o cache ainda é válido
    if ((Date.now() - entry.timestamp) >= CACHE_TTL) {
        cache.delete(CACHE_PREFIX + key);
        return null;
    }
    return entry.data;
}

/**
 * Limpa todo o cache deste módulo.
 * Útil para forçar uma atualização das configurações.
 */
function cacheClear() {
    for (const key of cache.keys()) {
        if (key.startsWith(CACHE_PREFIX)) {
            cache.delete(key);
        }
    }
}

// ===========================================================================
// FUNÇÕES DE ACESSO AO FIREBASE
// ===========================================================================

/**
 * Realiza uma requisição GET ao Firebase Realtime Database.
 *
 * @param {string} caminho - Caminho do nó no banco de dados (ex: 'config')
 * @returns {Promise<object>} Os dados parseados ou um objeto vazio em caso de erro.
 */
function buscarDoFirebase(caminho) {
    return new Promise((resolve) => {
        // Tenta obter do cache primeiro
        const cached = cacheGet(`firebase_${caminho}`);
        if (cached !== null) {
            console.log(`[Cache] Dados de '${caminho}' carregados do cache.`);
            return resolve(cached);
        }

        const url = `${FIREBASE_URL}${caminho}.json`;
        console.log(`[Firebase] Iniciando requisição para: ${url}`);

        const req = https.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                // Verifica se a resposta foi bem-sucedida
                if (res.statusCode !== 200) {
                    console.warn(`[Firebase] Resposta inesperada (${res.statusCode}) para '${caminho}'`);
                    return resolve({});
                }

                // Tenta parsear o JSON
                try {
                    const data = JSON.parse(body);
                    // Armazena no cache para próximas consultas
                    cacheSet(`firebase_${caminho}`, data || {});
                    console.log(`[Firebase] Dados de '${caminho}' carregados com sucesso.`);
                    resolve(data || {});
                } catch (parseError) {
                    console.error(`[Firebase] Erro ao parsear JSON de '${caminho}':`, parseError.message);
                    resolve({});
                }
            });
        });

        req.on('error', (err) => {
            console.error(`[Firebase] Erro de rede ao buscar '${caminho}':`, err.message);
            // Resolve com objeto vazio para não quebrar o fluxo
            resolve({});
        });

        // Timeout de 5 segundos para evitar esperas longas
        req.setTimeout(5000, () => {
            req.abort();
            console.warn(`[Firebase] Timeout ao buscar '${caminho}'`);
            resolve({});
        });
    });
}

// ===========================================================================
// CONFIGURAÇÃO PADRÃO DO CLIENTE (DEFAULT SETTINGS)
// ===========================================================================

/**
 * Objeto com todas as configurações padrão que o cliente Free Fire espera.
 * Estes valores são utilizados caso o Firebase não responda ou não contenha
 * os campos necessários.
 *
 * Alguns campos importantes:
 * - use_login_optional: deve ser true para permitir login de convidado
 * - server_url: URL base do servidor de login (substitua pela sua)
 * - remote_version: versão do servidor (deve bater com a do APK)
 */
const DEFAULT_APP_INFO = {
    // -------------------------------------------------------
    // URLs e CDN
    // -------------------------------------------------------
    appstore_url: 'https://play.google.com/store/apps/details?id=com.dts.freefireth',
    cdn_url: 'https://dl.cdn.freefiremobile.com/live/ABHotUpdates/',
    backup_cdn_url: 'https://dl.cdn.freefiremobile.com/live/ABHotUpdates/',
    img_cdn_url: 'https://dl.cdn.freefiremobile.com/common/',
    server_url: 'https://private-serverfrrunion.vercel.app/',
    event_log_url: 'https://private-serverfrrunion.vercel.app/',

    // -------------------------------------------------------
    // api/ver.js
export default function handler(req, res) {
  res.status(200).json({
    version: "1.43.0",
    server_url: "https://private-server-ff-2008-ou4z.vercel.app/",
    cdn_url: "https://cdn.barbosasmobile.com/",
    remote_version: "1.43.0",
    is_server_open: true,
    use_login_optional: true
    // -------------------------------------------------------
    // Estado do servidor
    // -------------------------------------------------------
    code: 0,
    is_server_open: true,
    is_review_server: false,
    is_firewall_open: false,
    force_to_restart_app: false,

    // -------------------------------------------------------
    // Login e autenticação
    // -------------------------------------------------------
    use_login_optional: true,          // ESSENCIAL para login convidado
    gdpr_version: 2,

    // -------------------------------------------------------
    // Mensagens e avisos
    // -------------------------------------------------------
    billboard_msg: '',
    maintenance_announcement: '',
    maintenance_region: '',

    // -------------------------------------------------------
    // Localização e idioma
    // -------------------------------------------------------
    lang: 'pt-br',
    country_code: 'BR',
    region: 'BR',

    // -------------------------------------------------------
    // Dispositivo e plataforma
    // -------------------------------------------------------
    device: 'android',
    appstore: 'googleplay',

    // -------------------------------------------------------
    // IP do cliente (será sobrescrito dinamicamente)
    // -------------------------------------------------------
    client_ip: '127.0.0.1',

    // -------------------------------------------------------
    // Campos extras que alguns APKs podem exigir
    // -------------------------------------------------------
    abhotupdate_cdn_url: 'https://dl-core.cdn.freefiremobile.com/live/ABHotUpdates/',
    login_servers: [
        {
            ip: '127.0.0.1',
            port: 60000,
            type: 'lobby'
        },
        {
            ip: '127.0.0.1',
            port: 60001,
            type: 'matchmake'
        }
    ],
    available_channels: ['live'],
    news: {
        android: '1.24.0 disponível!',
        ios: '1.24.0 disponível!'
    },
    features: {
        ranked: false,
        clan: false,
        battlepass: false,
        store: true,
        events: true
    }
};

// ===========================================================================
// FUNÇÕES DE VALIDAÇÃO E UTILITÁRIOS
// ===========================================================================

/**
 * Extrai o IP real do cliente a partir dos headers da requisição.
 * Considera proxies e balanceadores de carga.
 *
 * @param {object} req - Objeto de requisição HTTP
 * @returns {string} Endereço IP do cliente
 */
function getClientIP(req) {
    // Verifica headers comuns de proxy
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        // O primeiro IP da lista geralmente é o do cliente
        return forwarded.split(',')[0].trim();
    }
    // Tenta outros headers possíveis
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
    }
    // Usa o IP do socket como último recurso
    if (req.socket && req.socket.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return '127.0.0.1';
}

/**
 * Mescla dois objetos de configuração, dando preferência aos valores do segundo.
 * Apenas sobrescreve se o valor for definido (não undefined, não null).
 *
 * @param {object} base - Objeto base
 * @param {object} override - Objeto com valores para sobrescrever
 * @returns {object} Novo objeto mesclado
 */
function mergeConfig(base, override) {
    const result = Object.assign({}, base);
    for (const key of Object.keys(override)) {
        const value = override[key];
        // Só sobrescreve se o valor for realmente definido
        if (value !== undefined && value !== null) {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Verifica se um objeto contém os campos mínimos para ser uma configuração válida.
 *
 * @param {object} config - Objeto de configuração
 * @returns {boolean} True se a configuração parece válida
 */
function isConfigValid(config) {
    // Pelo menos server_url e version devem existir
    return config &&
           typeof config.server_url === 'string' &&
           typeof config.version === 'string';
}

/**
 * Registra informações da requisição para depuração.
 *
 * @param {object} req - Requisição HTTP
 */
function logRequest(req) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'desconhecido';
    console.log(`[Request] ${req.method} ${req.url} - IP: ${clientIP} - UA: ${userAgent.substring(0, 80)}`);
}

// ===========================================================================
// HANDLER PRINCIPAL DE ROTAS
// ===========================================================================

/**
 * Função principal exportada para o Vercel.
 * Trata todas as requisições que chegam a este módulo.
 *
 * Rotas esperadas (conforme vercel.json):
 * - Qualquer verbo em /live/ver.php, /live/*, /app/info/get
 */
module.exports = async (req, res) => {
    // ------------------------------------------------------------------------
    // 1. LOG DA REQUISIÇÃO
    // ------------------------------------------------------------------------
    logRequest(req);

    // ------------------------------------------------------------------------
    // 2. CONFIGURAÇÃO DE CORS MANUAL
    // ------------------------------------------------------------------------
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');

    // ------------------------------------------------------------------------
    // 3. RESPOSTA IMEDIATA PARA PREFLIGHT (OPTIONS)
    // ------------------------------------------------------------------------
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ------------------------------------------------------------------------
    // 4. CONFIGURAÇÕES ADICIONAIS DE HEADERS
    // ------------------------------------------------------------------------
    // Alguns clientes antigos podem precisar desses headers
    res.setHeader('Server', 'Garena-Lobby-Server');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // ------------------------------------------------------------------------
    // 5. OBTÉM A CONFIGURAÇÃO FINAL
    // ------------------------------------------------------------------------
    try {
        // Tenta carregar do Firebase
        const firebaseConfig = await buscarDoFirebase('config');

        // Se o Firebase retornou algo que parece válido, mescla com o padrão
        let finalConfig;
        if (isConfigValid(firebaseConfig)) {
            finalConfig = mergeConfig(DEFAULT_APP_INFO, firebaseConfig);
            console.log('[Config] Usando configuração do Firebase.');
        } else {
            // Se não veio nada ou veio incompleto, usa o padrão
            finalConfig = Object.assign({}, DEFAULT_APP_INFO);
            console.log('[Config] Firebase não retornou dados válidos, usando padrão.');
        }

        // Sempre atualiza o IP do cliente com o valor real
        finalConfig.client_ip = getClientIP(req);

        // Adiciona timestamp atual para referência
        finalConfig.server_time = Math.floor(Date.now() / 1000);
        finalConfig.timestamp = finalConfig.server_time;

        // --------------------------------------------------------------------
        // 6. ENVIA A RESPOSTA
        // --------------------------------------------------------------------
        res.status(200).json(finalConfig);
    } catch (error) {
        // --------------------------------------------------------------------
        // 7. TRATAMENTO DE ERROS INESPERADOS
        // --------------------------------------------------------------------
        console.error('[Erro] Falha ao gerar configuração:', error.message);
        console.error(error.stack);

        // Mesmo em caso de erro grave, retorna uma configuração válida
        // para que o cliente não fique completamente sem resposta.
        const fallbackConfig = Object.assign({}, DEFAULT_APP_INFO);
        fallbackConfig.client_ip = getClientIP(req);
        fallbackConfig.server_time = Math.floor(Date.now() / 1000);
        fallbackConfig.timestamp = fallbackConfig.server_time;
        fallbackConfig.maintenance_announcement = 'Servidor temporariamente instável.';

        res.status(200).json(fallbackConfig);
    }
};

// ===========================================================================
// EXPORTAÇÃO ADICIONAL PARA LIMPEZA DE CACHE (útil para debug)
// ===========================================================================

// Permite que outros módulos limpem o cache se necessário
module.exports.clearCache = cacheClear;

// ===========================================================================
// FIM DO ARQUIVO
// ===========================================================================

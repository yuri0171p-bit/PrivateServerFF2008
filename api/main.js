const http = require('http');          // Servidor HTTP
const url = require('url');            // Parse de URLs e query strings
const fs = require('fs');              // Leitura de arquivos JSON estáticos
const path = require('path');          // Manipulação de caminhos de arquivos
const crypto = require('crypto');      // Geração de tokens JWT e hash de senhas

// ---------------------------------------------------------------------------
// Constantes do ambiente (Firebase e outras, mantidas do código original)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;                      // Porta do servidor
const FIREBASE_PLAYER_URL = process.env.FIREBASE_DATABASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LOGIN_URL = process.env.FIREBASE_LOGIN_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_LOGIN_KEY = process.env.FIREBASE_LOGIN_KEY || '';
const FIREBASE_PLAYERTKEY = process.env.FIREBASE_AUTH_SECRET || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '6LcopZUsAAAAAD8KqpgXdBhvvdolJkjDu1K6bFmh5';
const FIREBASE_BASE_URL = process.env.FIREBASE_BASE_URL || 'https://project-store-47172-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const FIREBASE_URL = FIREBASE_PLAYER_URL;

// Constantes do servidor de jogo
const JWT_SECRET = 'barbosa-secret-key-2018-winterlands';  // Chave para assinar tokens JWT
const SERVER_NAME = 'Barbosa Server 1.25.3';               // Nome do servidor
const VERSION = '1.25.3';                                  // Versão suportada
const WINTERLANDS_BUILD = '20181201';                      // Build do Winterlands

// ---------------------------------------------------------------------------
// Estruturas de dados globais (em memória)
// ---------------------------------------------------------------------------
const cache = new Map();                // Cache genérico (tokens, respostas temporárias)
const CACHE_TTL = 60 * 1000;           // Tempo de vida do cache (60 segundos)

const users = new Map();                // Contas de usuário (simuladas) - userId -> userData
const matchmakingQueue = {              // Filas de matchmaking (apenas lógica simulada, sem WS)
  solo: [],
  duo: [],
  squad: []
};
const activeRooms = new Map();          // Salas de partida ativas - roomId -> roomData
const playerInventories = new Map();    // Inventário dos jogadores - userId -> items[]

// ---------------------------------------------------------------------------
// Dados persistentes simulados (mantidos do código original)
// ---------------------------------------------------------------------------
let playerProgress = {
    uid: '99999999',
    nickname: 'Player',
    gold: 1000,
    level: 1,
    diamonds: 500,
    isBanned: false,
    banReason: ''
};

// Lista de amigos estática (mantida do código original)
const friendsList = [
    { uid: '11111111', nickname: 'KallidadeOF', level: 50, online: true },
    { uid: '22222222', nickname: 'GuerreiroBR', level: 32, online: false },
    { uid: '33333333', nickname: 'ProPlayer2025', level: 70, online: true }
];

// ---------------------------------------------------------------------------
// Bytes misteriosos (mantidos do código original)
// ---------------------------------------------------------------------------
const mysteriousBytes = [
    76,
    117,
    107,
    105,
    110,
    103,
    62,
    32,
    110,
    195,
    163,
    111,
    32,
    102,
    97,
    122,
    32,
    109,
    97,
    105,
    115,
    112,
    32,
    97,
    114,
    116,
    101,
    108,
    101,
    115,
    46,
    10,
    10,
    84,
    111,
    100,
    97,
    115,
    32,
    97,
    115,
    32,
    99,
    110,
    116,
    97,
    115,
    32,
    113,
    117,
    101,
    32,
    117,
    116,
    105,
    108,
    105,
    122,
    97,
    109,
    32,
    111,
    32,
    115,
    101,
    114,
    118,
    105,
    100,
    111,
    114,
    32,
    112,
    114,
    105,
    118,
    97,
    100,
    111,
    46,
    10,
    79,
    98,
    114,
    105,
    103,
    97,
    100,
    111,
    32,
    112,
    111,
    114,
    32,
    101,
    113,
    117,
    105,
    112,
    101,
    32,
    66,
    97,
    114,
    98,
    111,
    115,
    97,
    46
];

// Dados extras do jogador (mantidos do código original)
const extraPlayerData = {
    "5": { "2": "KallidadeOF" },
    "6": { "1": "" },
    "7": 1776539822,
    "9": 1,
    "10": 1
};

// Configurações padrão do cliente (mantidas do código original)
const DEFAULT_SETTINGS = {
    abhotupdate_cdn_url: "https://dl-core.cdn.freefiremobile.com/live/ABHotUpdates/",
    backup_cdn_url: "https://dl.cdn.freefiremobile.com/live/ABHotUpdates/",
    appstore_url: 'https://discord.gg/projectreverger',
    billboard_msg: 'Bem-vindo ao servidor privado!',
    cdn_url: 'https://cdn.barbosasmobile.com/',
    code: 0,
    country_code: 'BR',
    force_to_restart_app: false,
    gdpr_version: 0,
    img_cdn_url: "https://dl.cdn.freefiremobile.com/common/",
    is_firewall_open: false,
    is_review_server: false,
    is_server_open: true,
    maintenance_announcement: 'Bem-vindo ao servidor privado!',
    maintenance_region: "",
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

// ===========================================================================
// SEÇÃO 2: CARREGAMENTO DE DADOS ESTÁTICOS (JSON)
// ===========================================================================

// Caminho base para os arquivos de dados
const DATA_DIR = path.join(__dirname, 'data');

/**
 * Carrega um arquivo JSON do diretório de dados.
 * Se o arquivo não existir ou houver erro, retorna os dados padrão fornecidos.
 * 
 * @param {string} filename - Nome do arquivo JSON (ex: 'weapons.json')
 * @param {object} defaultData - Dados padrão a serem usados em caso de falha
 * @returns {object} Dados carregados ou padrão
 */
function loadJSON(filename, defaultData) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      console.log(`[OK] Arquivo ${filename} carregado com sucesso.`);
      return JSON.parse(raw);
    }
  } catch (err) {
    console.log(`[AVISO] Não foi possível carregar ${filename}: ${err.message}`);
  }
  console.log(`[AVISO] Usando dados padrão para ${filename}`);
  return defaultData;
}

// Dados padrão para armas
const defaultWeapons = [
  { id: 1, name: 'M4A1', type: 'rifle', damage: 30, price: 500, rarity: 'common' },
  { id: 2, name: 'AK47', type: 'rifle', damage: 35, price: 600, rarity: 'common' },
  { id: 3, name: 'MP40', type: 'smg', damage: 22, price: 400, rarity: 'common' },
  { id: 4, name: 'AWM', type: 'sniper', damage: 80, price: 1000, rarity: 'rare' },
  { id: 5, name: 'M1887', type: 'shotgun', damage: 45, price: 550, rarity: 'common' },
  { id: 6, name: 'SCAR', type: 'rifle', damage: 32, price: 650, rarity: 'uncommon' },
  { id: 7, name: 'Grenade', type: 'throwable', damage: 90, price: 200, rarity: 'common' },
  { id: 8, name: 'Med Kit', type: 'consumable', heal: 50, price: 150, rarity: 'common' }
];

// Dados padrão para personagens
const defaultCharacters = [
  { id: 1, name: 'Adam', ability: 'None', price: 0, rarity: 'default' },
  { id: 2, name: 'Kelly', ability: 'Dash', price: 500, rarity: 'common' },
  { id: 3, name: 'Andrew', ability: 'Armor Repair', price: 400, rarity: 'common' },
  { id: 4, name: 'Moco', ability: 'Hack', price: 600, rarity: 'uncommon' },
  { id: 5, name: 'Maxim', ability: 'Fast Eat', price: 500, rarity: 'common' }
];

// Dados padrão para skins
const defaultSkins = [
  { id: 1, name: 'M4A1 Dragon', weapon_id: 1, price: 800, rarity: 'rare' },
  { id: 2, name: 'AK47 Flame', weapon_id: 2, price: 750, rarity: 'uncommon' },
  { id: 3, name: 'AWM Lightning', weapon_id: 4, price: 1200, rarity: 'epic' },
  { id: 4, name: 'MP40 Cobra', weapon_id: 3, price: 600, rarity: 'common' },
  { id: 5, name: 'Kelly Speed', character_id: 2, price: 700, rarity: 'rare' }
];

// Carrega os dados (ou usa os padrão)
const weapons = loadJSON('weapons.json', defaultWeapons);
const characters = loadJSON('characters.json', defaultCharacters);
const skins = loadJSON('skins.json', defaultSkins);

// Inicializa o inventário do jogador padrão com o Adam e alguns itens básicos
if (!playerInventories.has('99999999')) {
  playerInventories.set('99999999', [
    { type: 'character', id: 1, equipped: true },   // Adam equipado
    { type: 'weapon', id: 1, equipped: true },       // M4A1 equipada
    { type: 'weapon', id: 3, equipped: false },      // MP40
    { type: 'consumable', id: 8, quantity: 5 }       // 5 Med Kits
  ]);
}

// ===========================================================================
// SEÇÃO 2.5: PACOTE DE IDIOMAS (LOCALIZATION)
// ===========================================================================

/**
 * Dicionários de tradução padrão para vários idiomas.
 * As chaves são os códigos de idioma (ex: 'pt-br', 'en', 'es').
 * Cada idioma contém um mapeamento de chaves de texto para a tradução.
 * 
 * Esses dados podem ser substituídos por arquivos JSON na pasta data/ 
 * (ex: data/pt-br.json, data/en.json).
 */
const defaultLanguages = {
  'pt-br': {
    // Lobby
    'T_19_P_LOGIN_GUEST': 'Convidado',
    'T_19_P_LOGIN_FB': 'Facebook',
    'T_19_P_LOGIN_MORE': 'Mais',
    'T_19_P_LOGIN_VK': 'VK',
    'T_19_P_LOGIN_GOOGLE': 'Google',
    'T_19_P_LOGIN_TWITTER': 'Twitter',
    'T_19_P_LOGIN_APPLE': 'Apple',
    'T_19_P_LOGIN_HUAWEI': 'Huawei',
    'T_19_P_LOGIN_WECHAT': 'WeChat',
    'T_19_P_LOGIN_QQ': 'QQ',
    'T_19_P_LOGIN_LINE': 'LINE',
    'T_19_P_LOGIN_DISCORD': 'Discord',
    'T_19_P_LOGIN_STEAM': 'Steam',
    'T_19_P_LOGIN_PLAYSTATION': 'PlayStation',
    'T_19_P_LOGIN_XBOX': 'Xbox',
    'T_19_P_LOGIN_SWITCH': 'Switch',
    'T_19_P_LOGIN_PHONE': 'Telefone',
    'T_19_P_LOGIN_EMAIL': 'E-mail',
    'T_19_P_LOGIN_PASSWORD': 'Senha',
    'T_19_P_LOGIN_FORGOT': 'Esqueceu a senha?',
    'T_19_P_LOGIN_REMEMBER': 'Lembrar-me',
    'T_19_P_LOGIN_LOGIN': 'Entrar',
    'T_19_P_LOGIN_LOGOUT': 'Sair',
    'T_19_P_LOGIN_REGISTER': 'Registrar',
    'T_19_P_LOGIN_OR': 'Ou',
    'T_19_P_LOGIN_CONTINUE_GUEST': 'Continuar como convidado',
    'T_19_P_LOGIN_CONTINUE_FB': 'Continuar com Facebook',
    'T_19_P_LOGIN_CONTINUE_GOOGLE': 'Continuar com Google',
    'T_19_P_LOGIN_ACCOUNT_LINK': 'Vincular conta',
    'T_19_P_LOGIN_ACCOUNT_SWITCH': 'Trocar conta',
    'T_19_P_LOGIN_ACCOUNT_DELETE': 'Excluir conta',
    'T_19_P_LOGIN_ACCOUNT_INFO': 'Informações da conta',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS': 'Configurações da conta',
    'T_19_P_LOGIN_ACCOUNT_BIND': 'Vincular',
    'T_19_P_LOGIN_ACCOUNT_UNBIND': 'Desvincular',
    'T_19_P_LOGIN_ACCOUNT_BANNED': 'Conta banida',
    'T_19_P_LOGIN_ACCOUNT_SUSPENDED': 'Conta suspensa',
    'T_19_P_LOGIN_ACCOUNT_VERIFIED': 'Conta verificada',
    'T_19_P_LOGIN_ACCOUNT_UNVERIFIED': 'Conta não verificada',
    'T_19_P_LOGIN_ACCOUNT_LOCKED': 'Conta bloqueada',
    'T_19_P_LOGIN_ACCOUNT_RECOVERY': 'Recuperar conta',
    'T_19_P_LOGIN_ACCOUNT_2FA': 'Autenticação de dois fatores',
    'T_19_P_LOGIN_ACCOUNT_PHONE_VERIFY': 'Verificar telefone',
    'T_19_P_LOGIN_ACCOUNT_EMAIL_VERIFY': 'Verificar e-mail',
    'T_19_P_LOGIN_ACCOUNT_NICKNAME': 'Apelido',
    'T_19_P_LOGIN_ACCOUNT_UID': 'UID',
    'T_19_P_LOGIN_ACCOUNT_LEVEL': 'Nível',
    'T_19_P_LOGIN_ACCOUNT_EXP': 'Experiência',
    'T_19_P_LOGIN_ACCOUNT_GOLD': 'Ouro',
    'T_19_P_LOGIN_ACCOUNT_DIAMONDS': 'Diamantes',
    'T_19_P_LOGIN_ACCOUNT_BP': 'Passe de Batalha',
    'T_19_P_LOGIN_ACCOUNT_RANK': 'Rank',
    'T_19_P_LOGIN_ACCOUNT_GUILD': 'Clã',
    'T_19_P_LOGIN_ACCOUNT_FRIENDS': 'Amigos',
    'T_19_P_LOGIN_ACCOUNT_MAIL': 'Correio',
    'T_19_P_LOGIN_ACCOUNT_NOTIFICATIONS': 'Notificações',
    'T_19_P_LOGIN_ACCOUNT_INVENTORY': 'Inventário',
    'T_19_P_LOGIN_ACCOUNT_CHARACTERS': 'Personagens',
    'T_19_P_LOGIN_ACCOUNT_WEAPONS': 'Armas',
    'T_19_P_LOGIN_ACCOUNT_SKINS': 'Skins',
    'T_19_P_LOGIN_ACCOUNT_VEHICLES': 'Veículos',
    'T_19_P_LOGIN_ACCOUNT_PETS': 'Pets',
    'T_19_P_LOGIN_ACCOUNT_ACHIEVEMENTS': 'Conquistas',
    'T_19_P_LOGIN_ACCOUNT_MISSIONS': 'Missões',
    'T_19_P_LOGIN_ACCOUNT_EVENTS': 'Eventos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_LANG': 'Idioma',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_GRAPHICS': 'Gráficos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_AUDIO': 'Áudio',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CONTROLS': 'Controles',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SENSITIVITY': 'Sensibilidade',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_PRIVACY': 'Privacidade',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_TERMS': 'Termos de Serviço',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CREDITS': 'Créditos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SUPPORT': 'Suporte',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_ABOUT': 'Sobre',
    // Lobby
    'T_19_P_LOBBY_PLAY': 'JOGAR',
    'T_19_P_LOBBY_STORE': 'LOJA',
    'T_19_P_LOBBY_SETTINGS': 'CONFIGURAÇÕES',
    'T_19_P_LOBBY_MAIL': 'CORREIO',
    'T_19_P_LOBBY_FRIENDS': 'AMIGOS',
    'T_19_P_LOBBY_MISSIONS': 'MISSÕES',
    'T_19_P_LOBBY_EVENTS': 'EVENTOS',
    'T_19_P_LOBBY_RANKED': 'RANQUEADO',
    'T_19_P_LOBBY_CLAN': 'CLÃ',
    'T_19_P_LOBBY_BATTLEPASS': 'PASSE DE BATALHA',
    'T_19_P_LOBBY_WEAPON_ROYALE': 'ROYALE DE ARMAS',
    'T_19_P_LOBBY_LUCK_ROYALE': 'ROYALE DA SORTE',
    'T_19_P_LOBBY_PROFILE': 'PERFIL',
    'T_19_P_LOBBY_INVENTORY': 'INVENTÁRIO',
    // Personagens
    'T_19_P_CHAR_ADAM': 'Adam',
    'T_19_P_CHAR_ADAM_DESC': 'O primeiro personagem.',
    'T_19_P_CHAR_KELLY': 'Kelly',
    'T_19_P_CHAR_KELLY_DESC': 'Uma velocista profissional.',
    'T_19_P_CHAR_ANDREW': 'Andrew',
    'T_19_P_CHAR_ANDREW_DESC': 'Especialista em reparos de colete.',
    'T_19_P_CHAR_MOCO': 'Moco',
    'T_19_P_CHAR_MOCO_DESC': 'Uma hacker excepcional.',
    'T_19_P_CHAR_MAXIM': 'Maxim',
    'T_19_P_CHAR_MAXIM_DESC': 'Come rápido e se recupera.',
    // Armas
    'T_19_P_WEAPON_M4A1': 'M4A1',
    'T_19_P_WEAPON_AK47': 'AK47',
    'T_19_P_WEAPON_MP40': 'MP40',
    'T_19_P_WEAPON_AWM': 'AWM',
    'T_19_P_WEAPON_M1887': 'M1887',
    'T_19_P_WEAPON_SCAR': 'SCAR',
    'T_19_P_WEAPON_GRENADE': 'Granada',
    'T_19_P_WEAPON_MEDKIT': 'Kit Médico',
    // Modos de jogo
    'T_19_P_MODE_SOLO': 'Solo',
    'T_19_P_MODE_DUO': 'Dupla',
    'T_19_P_MODE_SQUAD': 'Esquadrão',
    // Loja
    'T_19_P_SHOP_BUY': 'COMPRAR',
    'T_19_P_SHOP_EQUIP': 'EQUIPAR',
    'T_19_P_SHOP_PRICE': 'Preço',
    'T_19_P_SHOP_OWNED': 'ADQUIRIDO',
    'T_19_P_SHOP_NOT_ENOUGH_GOLD': 'Gold insuficiente!',
    'T_19_P_SHOP_PURCHASE_SUCCESS': 'Compra realizada com sucesso!',
    // Matchmaking
    'T_19_P_MATCHMAKING_SEARCHING': 'Procurando partida...',
    'T_19_P_MATCHMAKING_FOUND': 'Partida encontrada!',
    'T_19_P_MATCHMAKING_CANCEL': 'Cancelar',
    'T_19_P_MATCHMAKING_QUEUE_JOINED': 'Você entrou na fila.',
    // Partida
    'T_19_P_MATCH_START': 'A partida vai começar!',
    'T_19_P_MATCH_END': 'Partida finalizada!',
    'T_19_P_MATCH_WINNER': 'Vencedor',
    'T_19_P_MATCH_KILLS': 'Eliminações',
    'T_19_P_MATCH_DAMAGE': 'Dano',
    'T_19_P_MATCH_REWARDS': 'Recompensas',
    // Geral
    'T_19_P_GENERAL_OK': 'OK',
    'T_19_P_GENERAL_CANCEL': 'CANCELAR',
    'T_19_P_GENERAL_CONFIRM': 'CONFIRMAR',
    'T_19_P_GENERAL_BACK': 'VOLTAR',
    'T_19_P_GENERAL_SETTINGS': 'CONFIGURAÇÕES',
    'T_19_P_GENERAL_LANGUAGE': 'IDIOMA',
    'T_19_P_GENERAL_GRAPHICS': 'GRÁFICOS',
    'T_19_P_GENERAL_SENSITIVITY': 'SENSIBILIDADE',
    'T_19_P_GENERAL_AUDIO': 'ÁUDIO',
    'T_19_P_GENERAL_CONTROLS': 'CONTROLES',
    // Eventos
    'T_19_P_EVENT_SUMMER_TRAINING': 'Treinamento de Verão',
    'T_19_P_EVENT_ADAM_CHALLENGE': 'Desafio do Adam',
    'T_19_P_EVENT_DAILY_MISSIONS': 'Missões Diárias',
    // Notificações
    'T_19_P_NOTIF_MAIL_RECEIVED': 'Você recebeu um novo e-mail.',
    'T_19_P_NOTIF_FRIEND_REQUEST': 'Pedido de amizade recebido.',
    'T_19_P_NOTIF_REWARD_CLAIMED': 'Recompensa resgatada!',
    // Sistema
    'T_19_P_SYS_SERVER_ONLINE': 'Servidor online',
    'T_19_P_SYS_MAINTENANCE': 'Servidor em manutenção',
    'T_19_P_SYS_VERSION': 'Versão',
    'T_19_P_SYS_REGION': 'Região'
  },
  'en': {
    'T_19_P_LOGIN_GUEST': 'Guest',
    'T_19_P_LOGIN_FB': 'Facebook',
    'T_19_P_LOGIN_MORE': 'More',
    'T_19_P_LOGIN_VK': 'VK',
    'T_19_P_LOGIN_GOOGLE': 'Google',
    'T_19_P_LOGIN_TWITTER': 'Twitter',
    'T_19_P_LOGIN_APPLE': 'Apple',
    'T_19_P_LOGIN_HUAWEI': 'Huawei',
    'T_19_P_LOGIN_WECHAT': 'WeChat',
    'T_19_P_LOGIN_QQ': 'QQ',
    'T_19_P_LOGIN_LINE': 'LINE',
    'T_19_P_LOGIN_DISCORD': 'Discord',
    'T_19_P_LOGIN_STEAM': 'Steam',
    'T_19_P_LOGIN_PLAYSTATION': 'PlayStation',
    'T_19_P_LOGIN_XBOX': 'Xbox',
    'T_19_P_LOGIN_SWITCH': 'Switch',
    'T_19_P_LOGIN_PHONE': 'Phone',
    'T_19_P_LOGIN_EMAIL': 'E-mail',
    'T_19_P_LOGIN_PASSWORD': 'Password',
    'T_19_P_LOGIN_FORGOT': 'Forgot password?',
    'T_19_P_LOGIN_REMEMBER': 'Remember me',
    'T_19_P_LOGIN_LOGIN': 'Login',
    'T_19_P_LOGIN_LOGOUT': 'Logout',
    'T_19_P_LOGIN_REGISTER': 'Register',
    'T_19_P_LOGIN_OR': 'Or',
    'T_19_P_LOGIN_CONTINUE_GUEST': 'Continue as guest',
    'T_19_P_LOGIN_CONTINUE_FB': 'Continue with Facebook',
    'T_19_P_LOGIN_CONTINUE_GOOGLE': 'Continue with Google',
    'T_19_P_LOGIN_ACCOUNT_LINK': 'Link account',
    'T_19_P_LOGIN_ACCOUNT_SWITCH': 'Switch account',
    'T_19_P_LOGIN_ACCOUNT_DELETE': 'Delete account',
    'T_19_P_LOGIN_ACCOUNT_INFO': 'Account info',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS': 'Account settings',
    'T_19_P_LOGIN_ACCOUNT_BIND': 'Bind',
    'T_19_P_LOGIN_ACCOUNT_UNBIND': 'Unbind',
    'T_19_P_LOGIN_ACCOUNT_BANNED': 'Account banned',
    'T_19_P_LOGIN_ACCOUNT_SUSPENDED': 'Account suspended',
    'T_19_P_LOGIN_ACCOUNT_VERIFIED': 'Account verified',
    'T_19_P_LOGIN_ACCOUNT_UNVERIFIED': 'Account unverified',
    'T_19_P_LOGIN_ACCOUNT_LOCKED': 'Account locked',
    'T_19_P_LOGIN_ACCOUNT_RECOVERY': 'Account recovery',
    'T_19_P_LOGIN_ACCOUNT_2FA': 'Two-factor authentication',
    'T_19_P_LOGIN_ACCOUNT_PHONE_VERIFY': 'Verify phone',
    'T_19_P_LOGIN_ACCOUNT_EMAIL_VERIFY': 'Verify e-mail',
    'T_19_P_LOGIN_ACCOUNT_NICKNAME': 'Nickname',
    'T_19_P_LOGIN_ACCOUNT_UID': 'UID',
    'T_19_P_LOGIN_ACCOUNT_LEVEL': 'Level',
    'T_19_P_LOGIN_ACCOUNT_EXP': 'Experience',
    'T_19_P_LOGIN_ACCOUNT_GOLD': 'Gold',
    'T_19_P_LOGIN_ACCOUNT_DIAMONDS': 'Diamonds',
    'T_19_P_LOGIN_ACCOUNT_BP': 'Battle Pass',
    'T_19_P_LOGIN_ACCOUNT_RANK': 'Rank',
    'T_19_P_LOGIN_ACCOUNT_GUILD': 'Guild',
    'T_19_P_LOGIN_ACCOUNT_FRIENDS': 'Friends',
    'T_19_P_LOGIN_ACCOUNT_MAIL': 'Mail',
    'T_19_P_LOGIN_ACCOUNT_NOTIFICATIONS': 'Notifications',
    'T_19_P_LOGIN_ACCOUNT_INVENTORY': 'Inventory',
    'T_19_P_LOGIN_ACCOUNT_CHARACTERS': 'Characters',
    'T_19_P_LOGIN_ACCOUNT_WEAPONS': 'Weapons',
    'T_19_P_LOGIN_ACCOUNT_SKINS': 'Skins',
    'T_19_P_LOGIN_ACCOUNT_VEHICLES': 'Vehicles',
    'T_19_P_LOGIN_ACCOUNT_PETS': 'Pets',
    'T_19_P_LOGIN_ACCOUNT_ACHIEVEMENTS': 'Achievements',
    'T_19_P_LOGIN_ACCOUNT_MISSIONS': 'Missions',
    'T_19_P_LOGIN_ACCOUNT_EVENTS': 'Events',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_LANG': 'Language',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_GRAPHICS': 'Graphics',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_AUDIO': 'Audio',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CONTROLS': 'Controls',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SENSITIVITY': 'Sensitivity',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_PRIVACY': 'Privacy',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_TERMS': 'Terms of Service',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CREDITS': 'Credits',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SUPPORT': 'Support',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_ABOUT': 'About',
    'T_19_P_LOBBY_PLAY': 'PLAY',
    'T_19_P_LOBBY_STORE': 'STORE',
    'T_19_P_LOBBY_SETTINGS': 'SETTINGS',
    'T_19_P_LOBBY_MAIL': 'MAIL',
    'T_19_P_LOBBY_FRIENDS': 'FRIENDS',
    'T_19_P_LOBBY_MISSIONS': 'MISSIONS',
    'T_19_P_LOBBY_EVENTS': 'EVENTS',
    'T_19_P_LOBBY_RANKED': 'RANKED',
    'T_19_P_LOBBY_CLAN': 'CLAN',
    'T_19_P_LOBBY_BATTLEPASS': 'BATTLE PASS',
    'T_19_P_LOBBY_WEAPON_ROYALE': 'WEAPON ROYALE',
    'T_19_P_LOBBY_LUCK_ROYALE': 'LUCK ROYALE',
    'T_19_P_LOBBY_PROFILE': 'PROFILE',
    'T_19_P_LOBBY_INVENTORY': 'INVENTORY',
    'T_19_P_CHAR_ADAM': 'Adam',
    'T_19_P_CHAR_ADAM_DESC': 'The original survivor.',
    'T_19_P_CHAR_KELLY': 'Kelly',
    'T_19_P_CHAR_KELLY_DESC': 'A professional sprinter.',
    'T_19_P_CHAR_ANDREW': 'Andrew',
    'T_19_P_CHAR_ANDREW_DESC': 'Armor repair specialist.',
    'T_19_P_CHAR_MOCO': 'Moco',
    'T_19_P_CHAR_MOCO_DESC': 'An outstanding hacker.',
    'T_19_P_CHAR_MAXIM': 'Maxim',
    'T_19_P_CHAR_MAXIM_DESC': 'Eats fast and recovers quickly.',
    'T_19_P_WEAPON_M4A1': 'M4A1',
    'T_19_P_WEAPON_AK47': 'AK47',
    'T_19_P_WEAPON_MP40': 'MP40',
    'T_19_P_WEAPON_AWM': 'AWM',
    'T_19_P_WEAPON_M1887': 'M1887',
    'T_19_P_WEAPON_SCAR': 'SCAR',
    'T_19_P_WEAPON_GRENADE': 'Grenade',
    'T_19_P_WEAPON_MEDKIT': 'Med Kit',
    'T_19_P_MODE_SOLO': 'Solo',
    'T_19_P_MODE_DUO': 'Duo',
    'T_19_P_MODE_SQUAD': 'Squad',
    'T_19_P_SHOP_BUY': 'BUY',
    'T_19_P_SHOP_EQUIP': 'EQUIP',
    'T_19_P_SHOP_PRICE': 'Price',
    'T_19_P_SHOP_OWNED': 'OWNED',
    'T_19_P_SHOP_NOT_ENOUGH_GOLD': 'Not enough gold!',
    'T_19_P_SHOP_PURCHASE_SUCCESS': 'Purchase successful!',
    'T_19_P_MATCHMAKING_SEARCHING': 'Searching for a match...',
    'T_19_P_MATCHMAKING_FOUND': 'Match found!',
    'T_19_P_MATCHMAKING_CANCEL': 'Cancel',
    'T_19_P_MATCHMAKING_QUEUE_JOINED': 'You joined the queue.',
    'T_19_P_MATCH_START': 'The match is about to start!',
    'T_19_P_MATCH_END': 'Match ended!',
    'T_19_P_MATCH_WINNER': 'Winner',
    'T_19_P_MATCH_KILLS': 'Kills',
    'T_19_P_MATCH_DAMAGE': 'Damage',
    'T_19_P_MATCH_REWARDS': 'Rewards',
    'T_19_P_GENERAL_OK': 'OK',
    'T_19_P_GENERAL_CANCEL': 'CANCEL',
    'T_19_P_GENERAL_CONFIRM': 'CONFIRM',
    'T_19_P_GENERAL_BACK': 'BACK',
    'T_19_P_GENERAL_SETTINGS': 'SETTINGS',
    'T_19_P_GENERAL_LANGUAGE': 'LANGUAGE',
    'T_19_P_GENERAL_GRAPHICS': 'GRAPHICS',
    'T_19_P_GENERAL_SENSITIVITY': 'SENSITIVITY',
    'T_19_P_GENERAL_AUDIO': 'AUDIO',
    'T_19_P_GENERAL_CONTROLS': 'CONTROLS',
    'T_19_P_EVENT_SUMMER_TRAINING': 'Summer Training',
    'T_19_P_EVENT_ADAM_CHALLENGE': 'Adam Challenge',
    'T_19_P_EVENT_DAILY_MISSIONS': 'Daily Missions',
    'T_19_P_NOTIF_MAIL_RECEIVED': 'You have received a new mail.',
    'T_19_P_NOTIF_FRIEND_REQUEST': 'Friend request received.',
    'T_19_P_NOTIF_REWARD_CLAIMED': 'Reward claimed!',
    'T_19_P_SYS_SERVER_ONLINE': 'Server online',
    'T_19_P_SYS_MAINTENANCE': 'Server under maintenance',
    'T_19_P_SYS_VERSION': 'Version',
    'T_19_P_SYS_REGION': 'Region'
  },
  'es': {
    'T_19_P_LOGIN_GUEST': 'Invitado',
    'T_19_P_LOGIN_FB': 'Facebook',
    'T_19_P_LOGIN_MORE': 'Más',
    'T_19_P_LOGIN_VK': 'VK',
    'T_19_P_LOGIN_GOOGLE': 'Google',
    'T_19_P_LOGIN_TWITTER': 'Twitter',
    'T_19_P_LOGIN_APPLE': 'Apple',
    'T_19_P_LOGIN_HUAWEI': 'Huawei',
    'T_19_P_LOGIN_WECHAT': 'WeChat',
    'T_19_P_LOGIN_QQ': 'QQ',
    'T_19_P_LOGIN_LINE': 'LINE',
    'T_19_P_LOGIN_DISCORD': 'Discord',
    'T_19_P_LOGIN_STEAM': 'Steam',
    'T_19_P_LOGIN_PLAYSTATION': 'PlayStation',
    'T_19_P_LOGIN_XBOX': 'Xbox',
    'T_19_P_LOGIN_SWITCH': 'Switch',
    'T_19_P_LOGIN_PHONE': 'Teléfono',
    'T_19_P_LOGIN_EMAIL': 'Correo electrónico',
    'T_19_P_LOGIN_PASSWORD': 'Contraseña',
    'T_19_P_LOGIN_FORGOT': '¿Olvidaste tu contraseña?',
    'T_19_P_LOGIN_REMEMBER': 'Recuérdame',
    'T_19_P_LOGIN_LOGIN': 'Iniciar sesión',
    'T_19_P_LOGIN_LOGOUT': 'Cerrar sesión',
    'T_19_P_LOGIN_REGISTER': 'Registrarse',
    'T_19_P_LOGIN_OR': 'O',
    'T_19_P_LOGIN_CONTINUE_GUEST': 'Continuar como invitado',
    'T_19_P_LOGIN_CONTINUE_FB': 'Continuar con Facebook',
    'T_19_P_LOGIN_CONTINUE_GOOGLE': 'Continuar con Google',
    'T_19_P_LOGIN_ACCOUNT_LINK': 'Vincular cuenta',
    'T_19_P_LOGIN_ACCOUNT_SWITCH': 'Cambiar cuenta',
    'T_19_P_LOGIN_ACCOUNT_DELETE': 'Eliminar cuenta',
    'T_19_P_LOGIN_ACCOUNT_INFO': 'Información de la cuenta',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS': 'Configuración de la cuenta',
    'T_19_P_LOGIN_ACCOUNT_BIND': 'Vincular',
    'T_19_P_LOGIN_ACCOUNT_UNBIND': 'Desvincular',
    'T_19_P_LOGIN_ACCOUNT_BANNED': 'Cuenta baneada',
    'T_19_P_LOGIN_ACCOUNT_SUSPENDED': 'Cuenta suspendida',
    'T_19_P_LOGIN_ACCOUNT_VERIFIED': 'Cuenta verificada',
    'T_19_P_LOGIN_ACCOUNT_UNVERIFIED': 'Cuenta no verificada',
    'T_19_P_LOGIN_ACCOUNT_LOCKED': 'Cuenta bloqueada',
    'T_19_P_LOGIN_ACCOUNT_RECOVERY': 'Recuperar cuenta',
    'T_19_P_LOGIN_ACCOUNT_2FA': 'Autenticación de dos factores',
    'T_19_P_LOGIN_ACCOUNT_PHONE_VERIFY': 'Verificar teléfono',
    'T_19_P_LOGIN_ACCOUNT_EMAIL_VERIFY': 'Verificar correo',
    'T_19_P_LOGIN_ACCOUNT_NICKNAME': 'Apodo',
    'T_19_P_LOGIN_ACCOUNT_UID': 'UID',
    'T_19_P_LOGIN_ACCOUNT_LEVEL': 'Nivel',
    'T_19_P_LOGIN_ACCOUNT_EXP': 'Experiencia',
    'T_19_P_LOGIN_ACCOUNT_GOLD': 'Oro',
    'T_19_P_LOGIN_ACCOUNT_DIAMONDS': 'Diamantes',
    'T_19_P_LOGIN_ACCOUNT_BP': 'Pase de batalla',
    'T_19_P_LOGIN_ACCOUNT_RANK': 'Rango',
    'T_19_P_LOGIN_ACCOUNT_GUILD': 'Clan',
    'T_19_P_LOGIN_ACCOUNT_FRIENDS': 'Amigos',
    'T_19_P_LOGIN_ACCOUNT_MAIL': 'Correo',
    'T_19_P_LOGIN_ACCOUNT_NOTIFICATIONS': 'Notificaciones',
    'T_19_P_LOGIN_ACCOUNT_INVENTORY': 'Inventario',
    'T_19_P_LOGIN_ACCOUNT_CHARACTERS': 'Personajes',
    'T_19_P_LOGIN_ACCOUNT_WEAPONS': 'Armas',
    'T_19_P_LOGIN_ACCOUNT_SKINS': 'Skins',
    'T_19_P_LOGIN_ACCOUNT_VEHICLES': 'Vehículos',
    'T_19_P_LOGIN_ACCOUNT_PETS': 'Mascotas',
    'T_19_P_LOGIN_ACCOUNT_ACHIEVEMENTS': 'Logros',
    'T_19_P_LOGIN_ACCOUNT_MISSIONS': 'Misiones',
    'T_19_P_LOGIN_ACCOUNT_EVENTS': 'Eventos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_LANG': 'Idioma',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_GRAPHICS': 'Gráficos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_AUDIO': 'Audio',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CONTROLS': 'Controles',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SENSITIVITY': 'Sensibilidad',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_PRIVACY': 'Privacidad',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_TERMS': 'Términos de servicio',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CREDITS': 'Créditos',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SUPPORT': 'Soporte',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_ABOUT': 'Acerca de',
    'T_19_P_LOBBY_PLAY': 'JUGAR',
    'T_19_P_LOBBY_STORE': 'TIENDA',
    'T_19_P_LOBBY_SETTINGS': 'CONFIGURACIÓN',
    'T_19_P_LOBBY_MAIL': 'CORREO',
    'T_19_P_LOBBY_FRIENDS': 'AMIGOS',
    'T_19_P_LOBBY_MISSIONS': 'MISIONES',
    'T_19_P_LOBBY_EVENTS': 'EVENTOS',
    'T_19_P_LOBBY_RANKED': 'CLASIFICADO',
    'T_19_P_LOBBY_CLAN': 'CLAN',
    'T_19_P_LOBBY_BATTLEPASS': 'PASE DE BATALLA',
    'T_19_P_LOBBY_WEAPON_ROYALE': 'ROYALE DE ARMAS',
    'T_19_P_LOBBY_LUCK_ROYALE': 'ROYALE DE SUERTE',
    'T_19_P_LOBBY_PROFILE': 'PERFIL',
    'T_19_P_LOBBY_INVENTORY': 'INVENTARIO',
    'T_19_P_CHAR_ADAM': 'Adam',
    'T_19_P_CHAR_ADAM_DESC': 'El primer sobreviviente.',
    'T_19_P_CHAR_KELLY': 'Kelly',
    'T_19_P_CHAR_KELLY_DESC': 'Una velocista profesional.',
    'T_19_P_CHAR_ANDREW': 'Andrew',
    'T_19_P_CHAR_ANDREW_DESC': 'Especialista en reparación de chalecos.',
    'T_19_P_CHAR_MOCO': 'Moco',
    'T_19_P_CHAR_MOCO_DESC': 'Una hacker sobresaliente.',
    'T_19_P_CHAR_MAXIM': 'Maxim',
    'T_19_P_CHAR_MAXIM_DESC': 'Come rápido y se recupera.',
    'T_19_P_WEAPON_M4A1': 'M4A1',
    'T_19_P_WEAPON_AK47': 'AK47',
    'T_19_P_WEAPON_MP40': 'MP40',
    'T_19_P_WEAPON_AWM': 'AWM',
    'T_19_P_WEAPON_M1887': 'M1887',
    'T_19_P_WEAPON_SCAR': 'SCAR',
    'T_19_P_WEAPON_GRENADE': 'Granada',
    'T_19_P_WEAPON_MEDKIT': 'Botiquín',
    'T_19_P_MODE_SOLO': 'Solitario',
    'T_19_P_MODE_DUO': 'Dúo',
    'T_19_P_MODE_SQUAD': 'Escuadrón',
    'T_19_P_SHOP_BUY': 'COMPRAR',
    'T_19_P_SHOP_EQUIP': 'EQUIPAR',
    'T_19_P_SHOP_PRICE': 'Precio',
    'T_19_P_SHOP_OWNED': 'ADQUIRIDO',
    'T_19_P_SHOP_NOT_ENOUGH_GOLD': '¡Oro insuficiente!',
    'T_19_P_SHOP_PURCHASE_SUCCESS': '¡Compra exitosa!',
    'T_19_P_MATCHMAKING_SEARCHING': 'Buscando partida...',
    'T_19_P_MATCHMAKING_FOUND': '¡Partida encontrada!',
    'T_19_P_MATCHMAKING_CANCEL': 'Cancelar',
    'T_19_P_MATCHMAKING_QUEUE_JOINED': 'Entraste en la cola.',
    'T_19_P_MATCH_START': '¡La partida va a comenzar!',
    'T_19_P_MATCH_END': '¡Partida terminada!',
    'T_19_P_MATCH_WINNER': 'Ganador',
    'T_19_P_MATCH_KILLS': 'Eliminaciones',
    'T_19_P_MATCH_DAMAGE': 'Daño',
    'T_19_P_MATCH_REWARDS': 'Recompensas',
    'T_19_P_GENERAL_OK': 'OK',
    'T_19_P_GENERAL_CANCEL': 'CANCELAR',
    'T_19_P_GENERAL_CONFIRM': 'CONFIRMAR',
    'T_19_P_GENERAL_BACK': 'VOLVER',
    'T_19_P_GENERAL_SETTINGS': 'CONFIGURACIÓN',
    'T_19_P_GENERAL_LANGUAGE': 'IDIOMA',
    'T_19_P_GENERAL_GRAPHICS': 'GRÁFICOS',
    'T_19_P_GENERAL_SENSITIVITY': 'SENSIBILIDAD',
    'T_19_P_GENERAL_AUDIO': 'AUDIO',
    'T_19_P_GENERAL_CONTROLS': 'CONTROLES',
    'T_19_P_EVENT_SUMMER_TRAINING': 'Entrenamiento de Verano',
    'T_19_P_EVENT_ADAM_CHALLENGE': 'Desafío de Adam',
    'T_19_P_EVENT_DAILY_MISSIONS': 'Misiones Diarias',
    'T_19_P_NOTIF_MAIL_RECEIVED': 'Has recibido un nuevo correo.',
    'T_19_P_NOTIF_FRIEND_REQUEST': 'Solicitud de amistad recibida.',
    'T_19_P_NOTIF_REWARD_CLAIMED': '¡Recompensa reclamada!',
    'T_19_P_SYS_SERVER_ONLINE': 'Servidor en línea',
    'T_19_P_SYS_MAINTENANCE': 'Servidor en mantenimiento',
    'T_19_P_SYS_VERSION': 'Versión',
    'T_19_P_SYS_REGION': 'Región'
  },
  'id': {
    'T_19_P_LOGIN_GUEST': 'Tamu',
    'T_19_P_LOGIN_FB': 'Facebook',
    'T_19_P_LOGIN_MORE': 'Lainnya',
    'T_19_P_LOGIN_VK': 'VK',
    'T_19_P_LOGIN_GOOGLE': 'Google',
    'T_19_P_LOGIN_TWITTER': 'Twitter',
    'T_19_P_LOGIN_APPLE': 'Apple',
    'T_19_P_LOGIN_HUAWEI': 'Huawei',
    'T_19_P_LOGIN_WECHAT': 'WeChat',
    'T_19_P_LOGIN_QQ': 'QQ',
    'T_19_P_LOGIN_LINE': 'LINE',
    'T_19_P_LOGIN_DISCORD': 'Discord',
    'T_19_P_LOGIN_STEAM': 'Steam',
    'T_19_P_LOGIN_PLAYSTATION': 'PlayStation',
    'T_19_P_LOGIN_XBOX': 'Xbox',
    'T_19_P_LOGIN_SWITCH': 'Switch',
    'T_19_P_LOGIN_PHONE': 'Telepon',
    'T_19_P_LOGIN_EMAIL': 'Surel',
    'T_19_P_LOGIN_PASSWORD': 'Kata sandi',
    'T_19_P_LOGIN_FORGOT': 'Lupa kata sandi?',
    'T_19_P_LOGIN_REMEMBER': 'Ingat saya',
    'T_19_P_LOGIN_LOGIN': 'Masuk',
    'T_19_P_LOGIN_LOGOUT': 'Keluar',
    'T_19_P_LOGIN_REGISTER': 'Daftar',
    'T_19_P_LOGIN_OR': 'Atau',
    'T_19_P_LOGIN_CONTINUE_GUEST': 'Lanjutkan sebagai tamu',
    'T_19_P_LOGIN_CONTINUE_FB': 'Lanjutkan dengan Facebook',
    'T_19_P_LOGIN_CONTINUE_GOOGLE': 'Lanjutkan dengan Google',
    'T_19_P_LOGIN_ACCOUNT_LINK': 'Tautkan akun',
    'T_19_P_LOGIN_ACCOUNT_SWITCH': 'Ganti akun',
    'T_19_P_LOGIN_ACCOUNT_DELETE': 'Hapus akun',
    'T_19_P_LOGIN_ACCOUNT_INFO': 'Info akun',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS': 'Pengaturan akun',
    'T_19_P_LOGIN_ACCOUNT_BIND': 'Ikat',
    'T_19_P_LOGIN_ACCOUNT_UNBIND': 'Lepas',
    'T_19_P_LOGIN_ACCOUNT_BANNED': 'Akun diblokir',
    'T_19_P_LOGIN_ACCOUNT_SUSPENDED': 'Akun ditangguhkan',
    'T_19_P_LOGIN_ACCOUNT_VERIFIED': 'Akun terverifikasi',
    'T_19_P_LOGIN_ACCOUNT_UNVERIFIED': 'Akun belum terverifikasi',
    'T_19_P_LOGIN_ACCOUNT_LOCKED': 'Akun terkunci',
    'T_19_P_LOGIN_ACCOUNT_RECOVERY': 'Pemulihan akun',
    'T_19_P_LOGIN_ACCOUNT_2FA': 'Otentikasi dua faktor',
    'T_19_P_LOGIN_ACCOUNT_PHONE_VERIFY': 'Verifikasi telepon',
    'T_19_P_LOGIN_ACCOUNT_EMAIL_VERIFY': 'Verifikasi surel',
    'T_19_P_LOGIN_ACCOUNT_NICKNAME': 'Nama panggilan',
    'T_19_P_LOGIN_ACCOUNT_UID': 'UID',
    'T_19_P_LOGIN_ACCOUNT_LEVEL': 'Level',
    'T_19_P_LOGIN_ACCOUNT_EXP': 'Pengalaman',
    'T_19_P_LOGIN_ACCOUNT_GOLD': 'Emas',
    'T_19_P_LOGIN_ACCOUNT_DIAMONDS': 'Berlian',
    'T_19_P_LOGIN_ACCOUNT_BP': 'Battle Pass',
    'T_19_P_LOGIN_ACCOUNT_RANK': 'Peringkat',
    'T_19_P_LOGIN_ACCOUNT_GUILD': 'Klan',
    'T_19_P_LOGIN_ACCOUNT_FRIENDS': 'Teman',
    'T_19_P_LOGIN_ACCOUNT_MAIL': 'Surat',
    'T_19_P_LOGIN_ACCOUNT_NOTIFICATIONS': 'Notifikasi',
    'T_19_P_LOGIN_ACCOUNT_INVENTORY': 'Inventaris',
    'T_19_P_LOGIN_ACCOUNT_CHARACTERS': 'Karakter',
    'T_19_P_LOGIN_ACCOUNT_WEAPONS': 'Senjata',
    'T_19_P_LOGIN_ACCOUNT_SKINS': 'Kulit',
    'T_19_P_LOGIN_ACCOUNT_VEHICLES': 'Kendaraan',
    'T_19_P_LOGIN_ACCOUNT_PETS': 'Hewan',
    'T_19_P_LOGIN_ACCOUNT_ACHIEVEMENTS': 'Pencapaian',
    'T_19_P_LOGIN_ACCOUNT_MISSIONS': 'Misi',
    'T_19_P_LOGIN_ACCOUNT_EVENTS': 'Acara',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_LANG': 'Bahasa',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_GRAPHICS': 'Grafis',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_AUDIO': 'Audio',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CONTROLS': 'Kontrol',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SENSITIVITY': 'Sensitivitas',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_PRIVACY': 'Privasi',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_TERMS': 'Ketentuan Layanan',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CREDITS': 'Kredit',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SUPPORT': 'Dukungan',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_ABOUT': 'Tentang',
    'T_19_P_LOBBY_PLAY': 'MAIN',
    'T_19_P_LOBBY_STORE': 'TOKO',
    'T_19_P_LOBBY_SETTINGS': 'PENGATURAN',
    'T_19_P_LOBBY_MAIL': 'SURAT',
    'T_19_P_LOBBY_FRIENDS': 'TEMAN',
    'T_19_P_LOBBY_MISSIONS': 'MISI',
    'T_19_P_LOBBY_EVENTS': 'ACARA',
    'T_19_P_LOBBY_RANKED': 'PERINGKAT',
    'T_19_P_LOBBY_CLAN': 'KLEN',
    'T_19_P_LOBBY_BATTLEPASS': 'BATTLE PASS',
    'T_19_P_LOBBY_WEAPON_ROYALE': 'ROYALE SENJATA',
    'T_19_P_LOBBY_LUCK_ROYALE': 'ROYALE KEBERUNTUNGAN',
    'T_19_P_LOBBY_PROFILE': 'PROFIL',
    'T_19_P_LOBBY_INVENTORY': 'INVENTARIS',
    'T_19_P_CHAR_ADAM': 'Adam',
    'T_19_P_CHAR_ADAM_DESC': 'Penyintas pertama.',
    'T_19_P_CHAR_KELLY': 'Kelly',
    'T_19_P_CHAR_KELLY_DESC': 'Pelari cepat profesional.',
    'T_19_P_CHAR_ANDREW': 'Andrew',
    'T_19_P_CHAR_ANDREW_DESC': 'Spesialis perbaikan rompi.',
    'T_19_P_CHAR_MOCO': 'Moco',
    'T_19_P_CHAR_MOCO_DESC': 'Hacker yang luar biasa.',
    'T_19_P_CHAR_MAXIM': 'Maxim',
    'T_19_P_CHAR_MAXIM_DESC': 'Makan cepat dan pulih dengan cepat.',
    'T_19_P_WEAPON_M4A1': 'M4A1',
    'T_19_P_WEAPON_AK47': 'AK47',
    'T_19_P_WEAPON_MP40': 'MP40',
    'T_19_P_WEAPON_AWM': 'AWM',
    'T_19_P_WEAPON_M1887': 'M1887',
    'T_19_P_WEAPON_SCAR': 'SCAR',
    'T_19_P_WEAPON_GRENADE': 'Granat',
    'T_19_P_WEAPON_MEDKIT': 'Kit Medis',
    'T_19_P_MODE_SOLO': 'Solo',
    'T_19_P_MODE_DUO': 'Duo',
    'T_19_P_MODE_SQUAD': 'Skuad',
    'T_19_P_SHOP_BUY': 'BELI',
    'T_19_P_SHOP_EQUIP': 'PAKAI',
    'T_19_P_SHOP_PRICE': 'Harga',
    'T_19_P_SHOP_OWNED': 'DIMILIKI',
    'T_19_P_SHOP_NOT_ENOUGH_GOLD': 'Emas tidak cukup!',
    'T_19_P_SHOP_PURCHASE_SUCCESS': 'Pembelian berhasil!',
    'T_19_P_MATCHMAKING_SEARCHING': 'Mencari pertandingan...',
    'T_19_P_MATCHMAKING_FOUND': 'Pertandingan ditemukan!',
    'T_19_P_MATCHMAKING_CANCEL': 'Batal',
    'T_19_P_MATCHMAKING_QUEUE_JOINED': 'Anda masuk antrean.',
    'T_19_P_MATCH_START': 'Pertandingan akan dimulai!',
    'T_19_P_MATCH_END': 'Pertandingan selesai!',
    'T_19_P_MATCH_WINNER': 'Pemenang',
    'T_19_P_MATCH_KILLS': 'Eliminasi',
    'T_19_P_MATCH_DAMAGE': 'Kerusakan',
    'T_19_P_MATCH_REWARDS': 'Hadiah',
    'T_19_P_GENERAL_OK': 'OK',
    'T_19_P_GENERAL_CANCEL': 'BATAL',
    'T_19_P_GENERAL_CONFIRM': 'KONFIRMASI',
    'T_19_P_GENERAL_BACK': 'KEMBALI',
    'T_19_P_GENERAL_SETTINGS': 'PENGATURAN',
    'T_19_P_GENERAL_LANGUAGE': 'BAHASA',
    'T_19_P_GENERAL_GRAPHICS': 'GRAFIS',
    'T_19_P_GENERAL_SENSITIVITY': 'SENSITIVITAS',
    'T_19_P_GENERAL_AUDIO': 'AUDIO',
    'T_19_P_GENERAL_CONTROLS': 'KONTROL',
    'T_19_P_EVENT_SUMMER_TRAINING': 'Latihan Musim Panas',
    'T_19_P_EVENT_ADAM_CHALLENGE': 'Tantangan Adam',
    'T_19_P_EVENT_DAILY_MISSIONS': 'Misi Harian',
    'T_19_P_NOTIF_MAIL_RECEIVED': 'Anda menerima surat baru.',
    'T_19_P_NOTIF_FRIEND_REQUEST': 'Permintaan pertemanan diterima.',
    'T_19_P_NOTIF_REWARD_CLAIMED': 'Hadiah diklaim!',
    'T_19_P_SYS_SERVER_ONLINE': 'Server online',
    'T_19_P_SYS_MAINTENANCE': 'Server dalam pemeliharaan',
    'T_19_P_SYS_VERSION': 'Versi',
    'T_19_P_SYS_REGION': 'Wilayah'
  },
  'th': {
    'T_19_P_LOGIN_GUEST': 'ผู้เล่นทั่วไป',
    'T_19_P_LOGIN_FB': 'Facebook',
    'T_19_P_LOGIN_MORE': 'เพิ่มเติม',
    'T_19_P_LOGIN_VK': 'VK',
    'T_19_P_LOGIN_GOOGLE': 'Google',
    'T_19_P_LOGIN_TWITTER': 'Twitter',
    'T_19_P_LOGIN_APPLE': 'Apple',
    'T_19_P_LOGIN_HUAWEI': 'Huawei',
    'T_19_P_LOGIN_WECHAT': 'WeChat',
    'T_19_P_LOGIN_QQ': 'QQ',
    'T_19_P_LOGIN_LINE': 'LINE',
    'T_19_P_LOGIN_DISCORD': 'Discord',
    'T_19_P_LOGIN_STEAM': 'Steam',
    'T_19_P_LOGIN_PLAYSTATION': 'PlayStation',
    'T_19_P_LOGIN_XBOX': 'Xbox',
    'T_19_P_LOGIN_SWITCH': 'Switch',
    'T_19_P_LOGIN_PHONE': 'โทรศัพท์',
    'T_19_P_LOGIN_EMAIL': 'อีเมล',
    'T_19_P_LOGIN_PASSWORD': 'รหัสผ่าน',
    'T_19_P_LOGIN_FORGOT': 'ลืมรหัสผ่าน?',
    'T_19_P_LOGIN_REMEMBER': 'จดจำฉัน',
    'T_19_P_LOGIN_LOGIN': 'เข้าสู่ระบบ',
    'T_19_P_LOGIN_LOGOUT': 'ออกจากระบบ',
    'T_19_P_LOGIN_REGISTER': 'ลงทะเบียน',
    'T_19_P_LOGIN_OR': 'หรือ',
    'T_19_P_LOGIN_CONTINUE_GUEST': 'ดำเนินการต่อในฐานะผู้เล่นทั่วไป',
    'T_19_P_LOGIN_CONTINUE_FB': 'ดำเนินการต่อด้วย Facebook',
    'T_19_P_LOGIN_CONTINUE_GOOGLE': 'ดำเนินการต่อด้วย Google',
    'T_19_P_LOGIN_ACCOUNT_LINK': 'เชื่อมโยงบัญชี',
    'T_19_P_LOGIN_ACCOUNT_SWITCH': 'สลับบัญชี',
    'T_19_P_LOGIN_ACCOUNT_DELETE': 'ลบบัญชี',
    'T_19_P_LOGIN_ACCOUNT_INFO': 'ข้อมูลบัญชี',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS': 'ตั้งค่าบัญชี',
    'T_19_P_LOGIN_ACCOUNT_BIND': 'ผูก',
    'T_19_P_LOGIN_ACCOUNT_UNBIND': 'ยกเลิกการผูก',
    'T_19_P_LOGIN_ACCOUNT_BANNED': 'บัญชีถูกแบน',
    'T_19_P_LOGIN_ACCOUNT_SUSPENDED': 'บัญชีถูกระงับ',
    'T_19_P_LOGIN_ACCOUNT_VERIFIED': 'บัญชีได้รับการยืนยัน',
    'T_19_P_LOGIN_ACCOUNT_UNVERIFIED': 'บัญชียังไม่ได้รับการยืนยัน',
    'T_19_P_LOGIN_ACCOUNT_LOCKED': 'บัญชีถูกล็อค',
    'T_19_P_LOGIN_ACCOUNT_RECOVERY': 'กู้คืนบัญชี',
    'T_19_P_LOGIN_ACCOUNT_2FA': 'การยืนยันสองขั้นตอน',
    'T_19_P_LOGIN_ACCOUNT_PHONE_VERIFY': 'ยืนยันโทรศัพท์',
    'T_19_P_LOGIN_ACCOUNT_EMAIL_VERIFY': 'ยืนยันอีเมล',
    'T_19_P_LOGIN_ACCOUNT_NICKNAME': 'ชื่อเล่น',
    'T_19_P_LOGIN_ACCOUNT_UID': 'UID',
    'T_19_P_LOGIN_ACCOUNT_LEVEL': 'เลเวล',
    'T_19_P_LOGIN_ACCOUNT_EXP': 'ประสบการณ์',
    'T_19_P_LOGIN_ACCOUNT_GOLD': 'ทอง',
    'T_19_P_LOGIN_ACCOUNT_DIAMONDS': 'เพชร',
    'T_19_P_LOGIN_ACCOUNT_BP': 'Battle Pass',
    'T_19_P_LOGIN_ACCOUNT_RANK': 'อันดับ',
    'T_19_P_LOGIN_ACCOUNT_GUILD': 'กิลด์',
    'T_19_P_LOGIN_ACCOUNT_FRIENDS': 'เพื่อน',
    'T_19_P_LOGIN_ACCOUNT_MAIL': 'จดหมาย',
    'T_19_P_LOGIN_ACCOUNT_NOTIFICATIONS': 'การแจ้งเตือน',
    'T_19_P_LOGIN_ACCOUNT_INVENTORY': 'กระเป๋า',
    'T_19_P_LOGIN_ACCOUNT_CHARACTERS': 'ตัวละคร',
    'T_19_P_LOGIN_ACCOUNT_WEAPONS': 'อาวุธ',
    'T_19_P_LOGIN_ACCOUNT_SKINS': 'สกิน',
    'T_19_P_LOGIN_ACCOUNT_VEHICLES': 'ยานพาหนะ',
    'T_19_P_LOGIN_ACCOUNT_PETS': 'สัตว์เลี้ยง',
    'T_19_P_LOGIN_ACCOUNT_ACHIEVEMENTS': 'ความสำเร็จ',
    'T_19_P_LOGIN_ACCOUNT_MISSIONS': 'ภารกิจ',
    'T_19_P_LOGIN_ACCOUNT_EVENTS': 'กิจกรรม',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_LANG': 'ภาษา',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_GRAPHICS': 'กราฟิก',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_AUDIO': 'เสียง',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CONTROLS': 'ควบคุม',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SENSITIVITY': 'ความไว',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_PRIVACY': 'ความเป็นส่วนตัว',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_TERMS': 'เงื่อนไขการให้บริการ',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_CREDITS': 'เครดิต',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_SUPPORT': 'สนับสนุน',
    'T_19_P_LOGIN_ACCOUNT_SETTINGS_ABOUT': 'เกี่ยวกับ',
    'T_19_P_LOBBY_PLAY': 'เล่น',
    'T_19_P_LOBBY_STORE': 'ร้านค้า',
    'T_19_P_LOBBY_SETTINGS': 'ตั้งค่า',
    'T_19_P_LOBBY_MAIL': 'จดหมาย',
    'T_19_P_LOBBY_FRIENDS': 'เพื่อน',
    'T_19_P_LOBBY_MISSIONS': 'ภารกิจ',
    'T_19_P_LOBBY_EVENTS': 'กิจกรรม',
    'T_19_P_LOBBY_RANKED': 'จัดอันดับ',
    'T_19_P_LOBBY_CLAN': 'แคลน',
    'T_19_P_LOBBY_BATTLEPASS': 'BATTLE PASS',
    'T_19_P_LOBBY_WEAPON_ROYALE': 'ROYALE อาวุธ',
    'T_19_P_LOBBY_LUCK_ROYALE': 'ROYALE โชคดี',
    'T_19_P_LOBBY_PROFILE': 'โปรไฟล์',
    'T_19_P_LOBBY_INVENTORY': 'กระเป๋า',
    'T_19_P_CHAR_ADAM': 'อดัม',
    'T_19_P_CHAR_ADAM_DESC': 'ผู้รอดชีวิตคนแรก',
    'T_19_P_CHAR_KELLY': 'เคลลี่',
    'T_19_P_CHAR_KELLY_DESC': 'นักวิ่งมืออาชีพ',
    'T_19_P_CHAR_ANDREW': 'แอนดรูว์',
    'T_19_P_CHAR_ANDREW_DESC': 'ผู้เชี่ยวชาญการซ่อมเกราะ',
    'T_19_P_CHAR_MOCO': 'โมโค',
    'T_19_P_CHAR_MOCO_DESC': 'แฮกเกอร์ที่ยอดเยี่ยม',
    'T_19_P_CHAR_MAXIM': 'แม็กซิม',
    'T_19_P_CHAR_MAXIM_DESC': 'กินเร็วและฟื้นตัวอย่างรวดเร็ว',
    'T_19_P_WEAPON_M4A1': 'M4A1',
    'T_19_P_WEAPON_AK47': 'AK47',
    'T_19_P_WEAPON_MP40': 'MP40',
    'T_19_P_WEAPON_AWM': 'AWM',
    'T_19_P_WEAPON_M1887': 'M1887',
    'T_19_P_WEAPON_SCAR': 'SCAR',
    'T_19_P_WEAPON_GRENADE': 'ระเบิด',
    'T_19_P_WEAPON_MEDKIT': 'ชุดแพทย์',
    'T_19_P_MODE_SOLO': 'เดี่ยว',
    'T_19_P_MODE_DUO': 'คู่',
    'T_19_P_MODE_SQUAD': 'ทีม',
    'T_19_P_SHOP_BUY': 'ซื้อ',
    'T_19_P_SHOP_EQUIP': 'สวมใส่',
    'T_19_P_SHOP_PRICE': 'ราคา',
    'T_19_P_SHOP_OWNED': 'เป็นเจ้าของ',
    'T_19_P_SHOP_NOT_ENOUGH_GOLD': 'ทองไม่พอ!',
    'T_19_P_SHOP_PURCHASE_SUCCESS': 'ซื้อสำเร็จ!',
    'T_19_P_MATCHMAKING_SEARCHING': 'กำลังค้นหาการแข่งขัน...',
    'T_19_P_MATCHMAKING_FOUND': 'พบการแข่งขัน!',
    'T_19_P_MATCHMAKING_CANCEL': 'ยกเลิก',
    'T_19_P_MATCHMAKING_QUEUE_JOINED': 'คุณเข้าคิวแล้ว',
    'T_19_P_MATCH_START': 'การแข่งขันกำลังจะเริ่ม!',
    'T_19_P_MATCH_END': 'การแข่งขันสิ้นสุด!',
    'T_19_P_MATCH_WINNER': 'ผู้ชนะ',
    'T_19_P_MATCH_KILLS': 'สังหาร',
    'T_19_P_MATCH_DAMAGE': 'ความเสียหาย',
    'T_19_P_MATCH_REWARDS': 'รางวัล',
    'T_19_P_GENERAL_OK': 'ตกลง',
    'T_19_P_GENERAL_CANCEL': 'ยกเลิก',
    'T_19_P_GENERAL_CONFIRM': 'ยืนยัน',
    'T_19_P_GENERAL_BACK': 'กลับ',
    'T_19_P_GENERAL_SETTINGS': 'ตั้งค่า',
    'T_19_P_GENERAL_LANGUAGE': 'ภาษา',
    'T_19_P_GENERAL_GRAPHICS': 'กราฟิก',
    'T_19_P_GENERAL_SENSITIVITY': 'ความไว',
    'T_19_P_GENERAL_AUDIO': 'เสียง',
    'T_19_P_GENERAL_CONTROLS': 'ควบคุม',
    'T_19_P_EVENT_SUMMER_TRAINING': 'การฝึกฤดูร้อน',
    'T_19_P_EVENT_ADAM_CHALLENGE': 'ความท้าทายของอดัม',
    'T_19_P_EVENT_DAILY_MISSIONS': 'ภารกิจรายวัน',
    'T_19_P_NOTIF_MAIL_RECEIVED': 'คุณได้รับจดหมายใหม่',
    'T_19_P_NOTIF_FRIEND_REQUEST': 'ได้รับคำขอเป็นเพื่อน',
    'T_19_P_NOTIF_REWARD_CLAIMED': 'รับรางวัลแล้ว!',
    'T_19_P_SYS_SERVER_ONLINE': 'เซิร์ฟเวอร์ออนไลน์',
    'T_19_P_SYS_MAINTENANCE': 'เซิร์ฟเวอร์กำลังบำรุงรักษา',
    'T_19_P_SYS_VERSION': 'เวอร์ชัน',
    'T_19_P_SYS_REGION': 'ภูมิภาค'
  }
};

/**
 * Carrega os idiomas disponíveis.
 * Para cada código de idioma, tenta carregar um arquivo JSON (ex: data/pt-br.json).
 * Se o arquivo não existir, usa o dicionário padrão definido em defaultLanguages.
 * O idioma 'pt-br' sempre estará disponível como fallback.
 * 
 * @returns {object} Objeto com todos os idiomas carregados
 */
function loadLanguages() {
  const languages = {};
  
  // Lista de idiomas suportados (pode ser expandida)
  const supportedLangs = Object.keys(defaultLanguages);
  
  for (const lang of supportedLangs) {
    // Tenta carregar o arquivo JSON específico do idioma
    const fileData = loadJSON(`${lang}.json`, null);
    if (fileData && typeof fileData === 'object' && Object.keys(fileData).length > 0) {
      languages[lang] = fileData;
      console.log(`[IDIOMA] ${lang} carregado do arquivo.`);
    } else {
      // Usa o dicionário padrão
      languages[lang] = defaultLanguages[lang] || {};
      console.log(`[IDIOMA] ${lang} carregado do padrão interno.`);
    }
  }
  
  // Garante que pt-br existe como fallback
  if (!languages['pt-br'] || Object.keys(languages['pt-br']).length === 0) {
    languages['pt-br'] = defaultLanguages['pt-br'];
  }
  
  return languages;
}

// Carrega todos os idiomas
const languages = loadLanguages();

// ===========================================================================
// SEÇÃO 3: FUNÇÕES AUXILIARES DE PROTOBUF (mantidas do código original)
// ===========================================================================

/**
 * Lê um varint (unsigned LEB128) do buffer a partir do offset fornecido.
 * Retorna um objeto com o valor (BigInt) e o novo offset.
 * 
 * @param {Buffer} buffer - O buffer de onde ler
 * @param {number} offset - Posição inicial no buffer
 * @returns {{value: bigint, offset: number}}
 */
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

/**
 * Decodifica um buffer no formato Protobuf para um objeto JavaScript.
 * Suporta wire types: 0 (varint), 1 (64-bit), 2 (length-delimited), 5 (32-bit).
 * 
 * @param {Buffer} buffer - Buffer com dados Protobuf
 * @returns {object} Objeto decodificado
 */
function decodeProtobuf(buffer) {
    const obj = {};
    let offset = 0;
    const view = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    while (offset < view.length) {
        const tag = readVarint(view, offset);
        offset = tag.offset;
        const fieldNumber = Number(tag.value >> 3n);
        const wireType = Number(tag.value & 0x07n);
        if (wireType === 0) { // Varint
            const varint = readVarint(view, offset);
            obj[fieldNumber] = safeInt64(varint.value, 0);
            offset = varint.offset;
        } else if (wireType === 1) { // 64-bit (double)
            if (offset + 8 > view.length) break;
            obj[fieldNumber] = view.readDoubleLE(offset);
            offset += 8;
        } else if (wireType === 5) { // 32-bit (float)
            if (offset + 4 > view.length) break;
            obj[fieldNumber] = view.readFloatLE(offset);
            offset += 4;
        } else if (wireType === 2) { // Length-delimited
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
            // Wire type desconhecido, encerra o loop para segurança
            break;
        }
    }
    return obj;
}

/**
 * Converte um valor BigInt ou number para um inteiro seguro (Number).
 * Trata complemento de dois para 64 bits se necessário.
 * 
 * @param {bigint|number} value - Valor a ser convertido
 * @param {number} defaultValue - Valor padrão se a conversão falhar
 * @returns {number} Inteiro seguro
 */
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

/**
 * Codifica um número como varint (unsigned LEB128) e retorna um Buffer.
 * 
 * @param {number|bigint} num - Número a ser codificado
 * @returns {Buffer}
 */
function encodeVarint(num) {
    const bytes = [];
    let value = BigInt(num);
    while (value > 0) {
        bytes.push(Number((value & 0x7Fn) | 0x80n));
        value >>= 7n;
    }
    if (bytes.length === 0) bytes.push(0);
    else bytes[bytes.length - 1] &= 0x7F; // Limpa o bit de continuação no último byte
    return Buffer.from(bytes);
}

/**
 * Codifica um objeto JavaScript em formato Protobuf simples.
 * Suporta números, strings, buffers, objetos e arrays (repetidos).
 * 
 * @param {object} obj - Objeto a ser codificado (chaves como números de campo)
 * @returns {Buffer}
 */
function encodeProtobuf(obj) {
    const chunks = [];
    for (const key of Object.keys(obj)) {
        const fieldNumber = parseInt(key);
        if (isNaN(fieldNumber)) continue;
        const value = obj[key];
        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                const tag = (fieldNumber << 3) | 0; // Wire type 0
                chunks.push(encodeVarint(tag), encodeVarint(value));
            } else {
                const tag = (fieldNumber << 3) | 1; // Wire type 1 (double)
                chunks.push(encodeVarint(tag));
                const b = Buffer.alloc(8);
                b.writeDoubleLE(value);
                chunks.push(b);
            }
        } else if (typeof value === 'string') {
            const strBuf = Buffer.from(value, 'utf-8');
            const tag = (fieldNumber << 3) | 2; // Wire type 2
            chunks.push(encodeVarint(tag), encodeVarint(strBuf.length), strBuf);
        } else if (Buffer.isBuffer(value)) {
            const tag = (fieldNumber << 3) | 2;
            chunks.push(encodeVarint(tag), encodeVarint(value.length), value);
        } else if (Array.isArray(value)) {
            // Campos repetidos: cada item é uma sub-mensagem com a mesma tag
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

// ===========================================================================
// SEÇÃO 4: FUNÇÕES DE RESPOSTA HTTP COM HEADERS CLOUDFLARE (mantidas)
// ===========================================================================

/**
 * Remove headers indesejados que podem ser adicionados por proxies (Vercel, Cloudflare).
 * 
 * @param {http.ServerResponse} res - Objeto de resposta HTTP
 */
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

/**
 * Aplica headers típicos de resposta do Cloudflare (estilo Barbosa Server).
 * Inclui Content-Type, Content-Length e vários headers de controle.
 * 
 * @param {http.ServerResponse} res - Objeto de resposta HTTP
 * @param {string} contentType - Tipo de conteúdo (ex: 'application/json')
 * @param {number} contentLength - Tamanho do corpo em bytes
 */
function applyCloudflareHeaders(res, contentType, contentLength) {
    // Remove headers automáticos que podem interferir
    removeVercelHeaders(res);
    // Adiciona os headers manualmente
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentLength);
    res.setHeader('alt-svc', 'h3=":443"; ma=86400');
    res.setHeader('cf-cache-status', 'DYNAMIC');
    res.setHeader('CF-RAY', '9fe607862821941-001');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Nel', '{"report_to":"cf-nel","success_fraction":0.0,"max_age":604500}');
    res.setHeader('Report-To', '{"group":"cf-nel","max_age":604000,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4/5-6dPumpx7Rh41fzoaR5g%2BhX5gKZFJKXZHIYARAKATOMY"}]}');
    res.setHeader('Server', 'cloudflare');
    res.setHeader('Server-Timing', 'cfCacheStatus;desc="DYNAMIC", cfEdge;dur=4, cfOrigin;dur=27');
    res.setHeader('Date', new Date().toUTCString());
    // Evita compressão indesejada que pode corromper respostas binárias
    res.setHeader('Cache-Control', 'no-transform');
}

/**
 * Envia uma resposta JSON com os headers Cloudflare.
 * 
 * @param {http.ServerResponse} res
 * @param {object} data - Dados a serem serializados como JSON
 * @param {number} statusCode - Código HTTP (padrão 200)
 */
function jsonResponse(res, data, statusCode = 200) {
    const body = JSON.stringify(data);
    const buffer = Buffer.from(body, 'utf-8');
    applyCloudflareHeaders(res, 'application/json; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

/**
 * Envia uma resposta de texto plano com os headers Cloudflare.
 * 
 * @param {http.ServerResponse} res
 * @param {string} text - Texto a ser enviado
 * @param {number} statusCode - Código HTTP (padrão 200)
 */
function textResponse(res, text, statusCode = 200) {
    const buffer = Buffer.from(text, 'utf-8');
    applyCloudflareHeaders(res, 'text/plain; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

/**
 * Envia uma resposta XML com os headers Cloudflare.
 * 
 * @param {http.ServerResponse} res
 * @param {string} xml - Conteúdo XML
 * @param {number} statusCode - Código HTTP (padrão 200)
 */
function xmlResponse(res, xml, statusCode = 200) {
    const buffer = Buffer.from(xml, 'utf-8');
    applyCloudflareHeaders(res, 'application/xml; charset=utf-8', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

/**
 * Envia uma resposta binária (octet-stream) com os headers Cloudflare.
 * 
 * @param {http.ServerResponse} res
 * @param {Buffer} buffer - Dados binários
 * @param {number} statusCode - Código HTTP (padrão 200)
 */
function binaryResponse(res, buffer, statusCode = 200) {
    applyCloudflareHeaders(res, 'application/octet-stream', buffer.length);
    res.writeHead(statusCode);
    return res.end(buffer);
}

// ===========================================================================
// SEÇÃO 5: UTILITÁRIOS DIVERSOS
// ===========================================================================

/**
 * Gera um item de e-mail (correio) simples.
 * Substitui os blocos gigantes do código original do Barbosa.
 * 
 * @param {number} id - ID do e-mail
 * @param {string} title - Título
 * @param {string} sender - Remetente
 * @param {string} message - Conteúdo da mensagem
 * @returns {object} Objeto de e-mail
 */
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

// E-mails iniciais do jogador
const initialMail = [
    generateMailItem(1, 'Bem-vindo!', 'Equipe Private Server', 'Obrigado por jogar no servidor privado. Personagem padrão: Adam.'),
    generateMailItem(2, 'Dica do Dia', 'Sistema', 'Use o chat para conhecer outros jogadores.'),
    generateMailItem(3, 'Evento de Verão', 'Moderação', 'Participe do evento e ganhe Gold extra.')
];

// ===========================================================================
// SEÇÃO 6: AUTENTICAÇÃO E ADMIN (mantido do original)
// ===========================================================================

const ADMIN_USERNAME = 'dono133teste';   // Nome de usuário do painel admin
const ADMIN_PASSWORD = 'six seven';      // Senha do painel admin
const adminSessions = new Map();         // Sessões admin ativas (token -> timestamp)

/**
 * Verifica se o token de autorização é válido para uma sessão admin.
 * 
 * @param {string} authHeader - Cabeçalho Authorization (Bearer token)
 * @returns {boolean} true se autenticado
 */
function verifyAdmin(authHeader) {
    if (!authHeader) return false;
    const token = authHeader.replace('Bearer ', '');
    const session = adminSessions.get(token);
    // Sessão válida por 1 hora
    return session && (Date.now() - session) < 3600000;
}

/**
 * Gera um token aleatório com prefixo.
 * 
 * @param {string} prefix - Prefixo do token (ex: 'acc', 'adm')
 * @returns {string} Token gerado
 */
function generateToken(prefix) {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
}

/**
 * Gera um token JWT simples (simulado) usando HMAC-SHA256.
 * 
 * @param {object} payload - Dados a serem incluídos no token
 * @returns {string} Token JWT
 */
function generateJWT(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

/**
 * Verifica um token JWT e retorna o payload se válido.
 * 
 * @param {string} token - Token JWT
 * @returns {object|null} Payload ou null se inválido
 */
function verifyJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
        if (signature !== parts[2]) return null;
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    } catch (e) {
        return null;
    }
}

// ===========================================================================
// SEÇÃO 7: LÓGICA DE MATCHMAKING SIMULADO (agora sem notificações WebSocket)
// ===========================================================================

/**
 * Adiciona um jogador à fila de matchmaking.
 * 
 * @param {string} userId - ID do usuário
 * @param {string} mode - Modalidade ('solo', 'duo', 'squad')
 * @param {number} level - Nível do jogador
 * @returns {object} Status da fila
 */
function addToMatchmaking(userId, mode, level) {
    if (!matchmakingQueue[mode]) {
        return { success: false, message: 'Modalidade inválida' };
    }
    
    // Verifica se o jogador já está em alguma fila
    for (const m of ['solo', 'duo', 'squad']) {
        matchmakingQueue[m] = matchmakingQueue[m].filter(p => p.userId !== userId);
    }
    
    // Adiciona à fila escolhida
    matchmakingQueue[mode].push({
        userId,
        level,
        joinedAt: Date.now()
    });
    
    console.log(`[MATCHMAKING] Jogador ${userId} entrou na fila ${mode}. Fila: ${matchmakingQueue[mode].length} jogadores.`);
    
    // Tenta formar partida se houver jogadores suficientes
    tryFormMatch(mode);
    
    return { success: true, position: matchmakingQueue[mode].length };
}

/**
 * Tenta formar uma partida com os jogadores na fila.
 * Apenas cria a sala, sem notificar os jogadores (não há WebSocket).
 * 
 * @param {string} mode - Modalidade
 */
function tryFormMatch(mode) {
    let requiredPlayers;
    switch (mode) {
        case 'solo': requiredPlayers = 2; break;
        case 'duo': requiredPlayers = 4; break;
        case 'squad': requiredPlayers = 8; break;
        default: return;
    }
    
    const queue = matchmakingQueue[mode];
    if (queue.length >= requiredPlayers) {
        const players = queue.splice(0, requiredPlayers);
        const roomId = generateToken('room');
        
        activeRooms.set(roomId, {
            id: roomId,
            mode,
            players: players.map(p => ({
                userId: p.userId,
                level: p.level,
                kills: 0,
                damage: 0,
                alive: true,
                position: { x: Math.random() * 1000, y: 0, z: Math.random() * 1000 },
                health: 100
            })),
            state: 'starting',
            startTime: Date.now(),
            endTime: null
        });
        
        console.log(`[MATCHMAKING] Partida ${roomId} criada com ${players.length} jogadores (${mode}). (Sem notificação WS)`);
        
        // Inicia a partida após um pequeno delay
        setTimeout(() => startMatch(roomId), 5000);
    }
}

/**
 * Inicia uma partida (muda o estado para 'playing').
 * 
 * @param {string} roomId - ID da sala
 */
function startMatch(roomId) {
    const room = activeRooms.get(roomId);
    if (!room) return;
    
    room.state = 'playing';
    console.log(`[MATCH] Partida ${roomId} iniciada.`);
    
    // Simula o fim da partida após um tempo (ex: 2 minutos)
    setTimeout(() => endMatch(roomId), 120000);
}

/**
 * Finaliza uma partida, calcula resultados e distribui recompensas.
 * 
 * @param {string} roomId - ID da sala
 */
function endMatch(roomId) {
    const room = activeRooms.get(roomId);
    if (!room || room.state === 'ended') return;
    
    room.state = 'ended';
    room.endTime = Date.now();
    console.log(`[MATCH] Partida ${roomId} finalizada.`);
    
    // Cálculo simples de ranking (por kills)
    const sorted = room.players.sort((a, b) => b.kills - a.kills);
    const winner = sorted[0];
    
    // Recompensas: gold baseado na posição
    const rewards = room.players.map((p, index) => {
        const goldEarned = Math.floor(100 / (index + 1)) + (p.kills * 10);
        return { userId: p.userId, position: index + 1, kills: p.kills, goldEarned };
    });
    
    // Atualiza o gold do jogador principal (simulado)
    rewards.forEach(r => {
        if (r.userId === playerProgress.uid) {
            playerProgress.gold += r.goldEarned;
        }
    });
    
    console.log(`[MATCH] Resultados da partida ${roomId}:`, rewards);
    
    // Limpa a sala após um tempo
    setTimeout(() => {
        activeRooms.delete(roomId);
        console.log(`[MATCH] Sala ${roomId} removida.`);
    }, 30000);
}

// ===========================================================================
// SEÇÃO 8: PERFIL E LOJA (mantido, sem alterações)
// ===========================================================================

/**
 * Retorna os dados do perfil de um jogador.
 * 
 * @param {string} userId - ID do usuário
 * @returns {object} Dados do perfil
 */
function getProfile(userId) {
    if (userId === playerProgress.uid) {
        return {
            uid: playerProgress.uid,
            nickname: playerProgress.nickname,
            level: playerProgress.level,
            gold: playerProgress.gold,
            diamonds: playerProgress.diamonds,
            inventory: playerInventories.get(userId) || [],
            character_list: [{ id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }],
            friends: friendsList,
            mail: initialMail
        };
    }
    return {
        uid: userId,
        nickname: `User_${userId}`,
        level: Math.floor(Math.random() * 50) + 1,
        gold: Math.floor(Math.random() * 5000),
        diamonds: Math.floor(Math.random() * 500),
        inventory: [
            { type: 'character', id: 1, equipped: true }
        ],
        character_list: [{ id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }]
    };
}

/**
 * Processa a compra de um item da loja.
 * 
 * @param {string} userId - ID do usuário
 * @param {number} itemId - ID do item
 * @param {string} itemType - Tipo do item ('weapon', 'character', 'skin', 'consumable')
 * @returns {object} Resultado da compra
 */
function buyItem(userId, itemId, itemType) {
    if (userId !== playerProgress.uid) {
        return { success: false, message: 'Usuário não encontrado' };
    }
    
    let item = null;
    let price = 0;
    
    switch (itemType) {
        case 'weapon':
            item = weapons.find(w => w.id === itemId);
            price = item ? item.price : 0;
            break;
        case 'character':
            item = characters.find(c => c.id === itemId);
            price = item ? item.price : 0;
            break;
        case 'skin':
            item = skins.find(s => s.id === itemId);
            price = item ? item.price : 0;
            break;
        case 'consumable':
            item = defaultWeapons.find(w => w.id === itemId && w.type === 'consumable');
            price = item ? item.price : 0;
            break;
        default:
            return { success: false, message: 'Tipo de item inválido' };
    }
    
    if (!item) {
        return { success: false, message: 'Item não encontrado' };
    }
    
    if (playerProgress.gold < price) {
        return { success: false, message: 'Gold insuficiente' };
    }
    
    playerProgress.gold -= price;
    
    const inventory = playerInventories.get(userId) || [];
    const existing = inventory.find(i => i.type === itemType && i.id === itemId);
    if (existing && itemType === 'consumable') {
        existing.quantity = (existing.quantity || 1) + 1;
    } else if (!existing) {
        inventory.push({ type: itemType, id: itemId, equipped: false, quantity: 1 });
    }
    playerInventories.set(userId, inventory);
    
    console.log(`[LOJA] ${playerProgress.nickname} comprou ${item.name} por ${price} gold.`);
    return { success: true, message: `Comprou ${item.name}!`, newBalance: playerProgress.gold };
}

// ===========================================================================
// SEÇÃO 9: ROTAS DO SERVIDOR HTTP
// ===========================================================================

const server = http.createServer((req, res) => {
    // Preflight CORS
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
        // ROTAS ORIGINAIS DO BARBOSA SERVER
        // ------------------------------------------------------------------
        if (route === '/live/ver.php' || route === '/live/appstoreversioninfo') {
            return textResponse(res, VERSION);
        }

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
                remote_version: VERSION,
                version: VERSION,
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
                remote_version: VERSION,
                version: VERSION,
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

        const oauthRoutes = [
            '/oauth/login', '/oauth/logout', '/oauth/user/friends/inapp/get/v2',
            '/rebates/redeem', '/rebate/options/get', '/access.line.me/dialog/oauth/weblogin'
        ];
        if (oauthRoutes.includes(route)) {
            return jsonResponse(res, { code: 0, message: "SUCCESS" });
        }

        // Rota de localização (agora com suporte completo a múltiplos idiomas)
        if (route.startsWith('/Localization/')) {
            // Extrai o código do idioma da URL. Ex: /Localization/pt-br -> 'pt-br'
            const langCode = route.split('/')[2] || 'pt-br';
            const langData = languages[langCode] || languages['pt-br'];
            return jsonResponse(res, langData);
        }

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

        if (route === '/crossdomain.xml') {
            const xml = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>';
            return xmlResponse(res, xml);
        }

        if (route === '/GetDailyRankingReward') {
            return binaryResponse(res, encodeProtobuf({ 1: [] }));
        }
        if (route === '/GetMultiList') {
            return binaryResponse(res, encodeProtobuf({ 1: [] }));
        }
        if (route === '/GetPlatformFriendIDs') {
            return binaryResponse(res, encodeProtobuf({ 1: [] }));
        }

        if (route === '/GetActivityDesc') {
            return jsonResponse(res, {
                "1": [
                    {
                        id: "101", title: "Evento de Verão",
                        description: "Participe e ganhe recompensas exclusivas!",
                        image: "https://cdn.barbosasmobile.com/news/summer.jpg",
                        start_time: now - 86400, end_time: now + 86400 * 7,
                        url: "https://barbosasmobile.com/event/101", weight: 1
                    },
                    {
                        id: "102", title: `Atualização ${VERSION}`,
                        description: "Melhorias de desempenho e tradução completa.",
                        image: "https://cdn.barbosasmobile.com/news/update.jpg",
                        start_time: now, end_time: now + 86400 * 14,
                        url: "https://barbosasmobile.com/event/102", weight: 2
                    }
                ],
                "2": {
                    id: "201", title: "Destaque: Adam",
                    description: "O clássico Adam está de volta!",
                    image: "https://cdn.barbosasmobile.com/news/adam.jpg",
                    start_time: now, end_time: now + 86400 * 30,
                    url: "https://barbosasmobile.com/feature/adam", highlight: true
                }
            });
        }

        if (route === '/app/info/get') {
            return jsonResponse(res, {
                version: VERSION,
                server_url: DEFAULT_SETTINGS.server_url,
                cdn_url: DEFAULT_SETTINGS.cdn_url,
                force_update: false, maintenance: false, maintenance_msg: "",
                region: "BR",
                login_servers: [
                    { ip: "127.0.0.1", port: 60000, type: "lobby" },
                    { ip: "127.0.0.1", port: 60001, type: "matchmake" }
                ],
                available_channels: ["live"],
                news: { android: `${VERSION} disponível!`, ios: `${VERSION} disponível!` }
            });
        }

        if (route === '/hidden/message') {
            return binaryResponse(res, Buffer.from(mysteriousBytes));
        }

        // Painel admin
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
            if (!verifyAdmin(req.headers.authorization)) {
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
            return jsonResponse(res, {
                server: 'online',
                players: 0,
                uptime: process.uptime(),
                playerProgress,
                activeRooms: activeRooms.size,
                queueSizes: {
                    solo: matchmakingQueue.solo.length,
                    duo: matchmakingQueue.duo.length,
                    squad: matchmakingQueue.squad.length
                }
            });
        }

        // ------------------------------------------------------------------
        // NOVAS ROTAS (educacional)
        // ------------------------------------------------------------------
        if (route === '/login' && req.method === 'POST') {
            let body = Buffer.alloc(0);
            req.on('data', chunk => body = Buffer.concat([body, chunk]));
            req.on('end', () => {
                try {
                    const loginReq = decodeProtobuf(body);
                    console.log('[LOGIN] Payload recebido:', JSON.stringify(loginReq, (k, v) => typeof v === 'bigint' ? v.toString() : v));
                    const userId = loginReq['1']?.toString() || playerProgress.uid;
                    const token = generateJWT({
                        sub: userId,
                        nickname: 'Player',
                        iat: Math.floor(Date.now() / 1000),
                        exp: Math.floor(Date.now() / 1000) + 86400
                    });
                    const response = encodeProtobuf({
                        1: token,
                        2: '127.0.0.1',
                        3: 60000,
                        4: '127.0.0.1',
                        5: 60001
                    });
                    return binaryResponse(res, response);
                } catch (e) {
                    console.error('[LOGIN] Erro:', e.message);
                    return binaryResponse(res, encodeProtobuf({ 1: 'Erro interno' }), 500);
                }
            });
            return;
        }

        if (route === '/config') {
            return jsonResponse(res, {
                ...DEFAULT_SETTINGS,
                version: VERSION,
                matchmaking_servers: [{ ip: '127.0.0.1', port: 60001, region: 'BR' }],
                cdn_base: 'https://cdn.barbosasmobile.com/',
                features: { ranked: false, clan: false, battlepass: false, store: true, events: true }
            });
        }

        if (route === '/matchmaking' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const result = addToMatchmaking(playerProgress.uid, data.mode || 'solo', playerProgress.level);
                    return jsonResponse(res, result);
                } catch (e) {
                    return jsonResponse(res, { success: false, message: 'JSON inválido' }, 400);
                }
            });
            return;
        }

        if (route === '/shop') {
            return jsonResponse(res, {
                weapons, characters, skins,
                playerGold: playerProgress.gold,
                playerDiamonds: playerProgress.diamonds
            });
        }

        if (route === '/shop/buy' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { itemId, itemType } = JSON.parse(body);
                    const result = buyItem(playerProgress.uid, itemId, itemType);
                    return jsonResponse(res, result, result.success ? 200 : 400);
                } catch (e) {
                    return jsonResponse(res, { success: false, message: 'JSON inválido' }, 400);
                }
            });
            return;
        }

        if (route === '/leaderboard') {
            return jsonResponse(res, [
                { rank: 1, nickname: 'ProPlayer99', level: 85, kills: 1500 },
                { rank: 2, nickname: 'KallidadeOF', level: 50, kills: 800 },
                { rank: 3, nickname: 'SniperBR', level: 72, kills: 750 },
                { rank: 4, nickname: 'GuerreiroBR', level: 32, kills: 300 },
                { rank: 5, nickname: playerProgress.nickname, level: playerProgress.level, kills: 100 }
            ]);
        }

        if (route === '/profile') {
            const auth = req.headers.authorization;
            if (!auth) return jsonResponse(res, { error: 'Token não fornecido' }, 401);
            const payload = verifyJWT(auth.replace('Bearer ', ''));
            if (!payload) return jsonResponse(res, { error: 'Token inválido' }, 401);
            const userId = payload.sub || payload.userId;
            return jsonResponse(res, getProfile(userId));
        }

        if (route === '/events') {
            return jsonResponse(res, [
                {
                    id: 'event_001', name: 'Treinamento de Verão',
                    description: 'Complete missões diárias para ganhar recompensas.',
                    startTime: now - 86400, endTime: now + 86400 * 14,
                    rewards: [{ type: 'gold', amount: 500 }, { type: 'weapon', id: 1 }]
                },
                {
                    id: 'event_002', name: 'Desafio do Adam',
                    description: 'Vença partidas usando apenas o Adam.',
                    startTime: now, endTime: now + 86400 * 7,
                    rewards: [{ type: 'diamonds', amount: 100 }]
                }
            ]);
        }

        // CATCH-ALL
        const mergedConfig = {
            ...DEFAULT_SETTINGS,
            version: query.version || VERSION,
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
            server_time: now, timestamp: now, login_time: now,
            expires_in: 86400, expire_time: now + 86400,
            is_guest: true, is_new_user: false, login_status: 1,
            is_vip: false, is_gm: false, gm_level: 0,
            is_admin: false, is_tester: false,
            show_test_btn: false, show_gm_panel: false, enable_console: false,
            character_id: 1, character_name: 'Adam', character_skin_id: 0, character_skin_name: '',
            inventory: playerInventories.get(playerProgress.uid) || [],
            character_list: [{ id: 1, name: 'Adam', skin_id: 0, skin_name: '', equipped: true, owned: true }],
            friends: friendsList,
            events: [], missions: [], achievements: [],
            mail: initialMail, notifications: [],
            extra: extraPlayerData,
            config: {},
            features: {
                ranked: false, clan: false, battlepass: false,
                store: true, luck_royale: false, weapon_royale: false,
                events: true, missions: true, mail: true, friends: true,
                chat: true, news: true, settings: true
            },
            settings: {
                graphics_quality: "Padrão", frame_rate: "Normal",
                control_style: "2 Dedos",
                sensitivity: { global: 50, red_dot: 50, scope_2x: 50, scope_4x: 50, sniper: 50, free_look: 50 },
                audio_master: 80, audio_sfx: 60, audio_voice: 40
            },
            debug: {}
        };
        return jsonResponse(res, mergedConfig);

    } catch (error) {
        console.error('[ERRO]', error.message);
        const errorBody = JSON.stringify(DEFAULT_SETTINGS);
        const errorBuffer = Buffer.from(errorBody, 'utf-8');
        applyCloudflareHeaders(res, 'application/json; charset=utf-8', errorBuffer.length);
        res.writeHead(500);
        return res.end(errorBuffer);
    }
});

// ===========================================================================
// SEÇÃO 10: INICIALIZAÇÃO DO SERVIDOR
// ===========================================================================

server.listen(PORT, () => {
    console.log('============================================================');
    console.log(` ${SERVER_NAME} (SEM WEBSOCKET)`);
    console.log(` Versão: ${VERSION} (Winterlands 2018)`);
    console.log(` Porta: ${PORT}`);
    console.log(` Endereço: http://localhost:${PORT}`);
    console.log(` Painel Admin: http://localhost:${PORT}/admin/login`);
    console.log(` Personagem padrão: Adam (ID: 1)`);
    console.log(` Idiomas carregados: ${Object.keys(languages).join(', ')}`);
    console.log('============================================================');
    console.log('[OK] Servidor pronto para receber conexões (apenas HTTP).');
});

module.exports = server;

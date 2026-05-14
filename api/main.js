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
    'LOBBY_PLAY': 'JOGAR',
    'LOBBY_STORE': 'LOJA',
    'LOBBY_SETTINGS': 'CONFIGURAÇÕES',
    'LOBBY_MAIL': 'CORREIO',
    'LOBBY_FRIENDS': 'AMIGOS',
    'LOBBY_MISSIONS': 'MISSÕES',
    'LOBBY_EVENTS': 'EVENTOS',
    'LOBBY_RANKED': 'RANQUEADO',
    'LOBBY_CLAN': 'CLÃ',
    'LOBBY_BATTLEPASS': 'PASSE DE BATALHA',
    'LOBBY_WEAPON_ROYALE': 'ROYALE DE ARMAS',
    'LOBBY_LUCK_ROYALE': 'ROYALE DA SORTE',
    'LOBBY_PROFILE': 'PERFIL',
    'LOBBY_INVENTORY': 'INVENTÁRIO',
    // Personagens
    'CHARACTER_ADAM': 'Adam',
    'CHARACTER_ADAM_DESC': 'O primeiro personagem.',
    'CHARACTER_KELLY': 'Kelly',
    'CHARACTER_KELLY_DESC': 'Uma velocista profissional.',
    'CHARACTER_ANDREW': 'Andrew',
    'CHARACTER_ANDREW_DESC': 'Especialista em reparos de colete.',
    'CHARACTER_MOCO': 'Moco',
    'CHARACTER_MOCO_DESC': 'Uma hacker excepcional.',
    'CHARACTER_MAXIM': 'Maxim',
    'CHARACTER_MAXIM_DESC': 'Come rápido e se recupera.',
    // Armas
    'WEAPON_M4A1': 'M4A1',
    'WEAPON_AK47': 'AK47',
    'WEAPON_MP40': 'MP40',
    'WEAPON_AWM': 'AWM',
    'WEAPON_M1887': 'M1887',
    'WEAPON_SCAR': 'SCAR',
    'WEAPON_GRENADE': 'Granada',
    'WEAPON_MEDKIT': 'Kit Médico',
    // Modos de jogo
    'MODE_SOLO': 'Solo',
    'MODE_DUO': 'Dupla',
    'MODE_SQUAD': 'Esquadrão',
    // Loja
    'SHOP_BUY': 'COMPRAR',
    'SHOP_EQUIP': 'EQUIPAR',
    'SHOP_PRICE': 'Preço',
    'SHOP_OWNED': 'ADQUIRIDO',
    'SHOP_NOT_ENOUGH_GOLD': 'Gold insuficiente!',
    'SHOP_PURCHASE_SUCCESS': 'Compra realizada com sucesso!',
    // Matchmaking
    'MATCHMAKING_SEARCHING': 'Procurando partida...',
    'MATCHMAKING_FOUND': 'Partida encontrada!',
    'MATCHMAKING_CANCEL': 'Cancelar',
    'MATCHMAKING_QUEUE_JOINED': 'Você entrou na fila.',
    // Partida
    'MATCH_START': 'A partida vai começar!',
    'MATCH_END': 'Partida finalizada!',
    'MATCH_WINNER': 'Vencedor',
    'MATCH_KILLS': 'Eliminações',
    'MATCH_DAMAGE': 'Dano',
    'MATCH_REWARDS': 'Recompensas',
    // Geral
    'GENERAL_OK': 'OK',
    'GENERAL_CANCEL': 'CANCELAR',
    'GENERAL_CONFIRM': 'CONFIRMAR',
    'GENERAL_BACK': 'VOLTAR',
    'GENERAL_SETTINGS': 'CONFIGURAÇÕES',
    'GENERAL_LANGUAGE': 'IDIOMA',
    'GENERAL_GRAPHICS': 'GRÁFICOS',
    'GENERAL_SENSITIVITY': 'SENSIBILIDADE',
    'GENERAL_AUDIO': 'ÁUDIO',
    'GENERAL_CONTROLS': 'CONTROLES',
    // Autenticação
    'AUTH_LOGIN': 'ENTRAR',
    'AUTH_LOGOUT': 'SAIR',
    'AUTH_GUEST': 'CONVIDADO',
    'AUTH_REGISTER': 'REGISTRAR',
    'AUTH_FORGOT_PASSWORD': 'ESQUECEU A SENHA?',
    // Eventos
    'EVENT_SUMMER_TRAINING': 'Treinamento de Verão',
    'EVENT_ADAM_CHALLENGE': 'Desafio do Adam',
    'EVENT_DAILY_MISSIONS': 'Missões Diárias',
    // Notificações
    'NOTIF_MAIL_RECEIVED': 'Você recebeu um novo e-mail.',
    'NOTIF_FRIEND_REQUEST': 'Pedido de amizade recebido.',
    'NOTIF_REWARD_CLAIMED': 'Recompensa resgatada!',
    // Sistema
    'SYS_SERVER_ONLINE': 'Servidor online',
    'SYS_MAINTENANCE': 'Servidor em manutenção',
    'SYS_VERSION': 'Versão',
    'SYS_REGION': 'Região'
  },
  'en': {
    'LOBBY_PLAY': 'PLAY',
    'LOBBY_STORE': 'STORE',
    'LOBBY_SETTINGS': 'SETTINGS',
    'LOBBY_MAIL': 'MAIL',
    'LOBBY_FRIENDS': 'FRIENDS',
    'LOBBY_MISSIONS': 'MISSIONS',
    'LOBBY_EVENTS': 'EVENTS',
    'LOBBY_RANKED': 'RANKED',
    'LOBBY_CLAN': 'CLAN',
    'LOBBY_BATTLEPASS': 'BATTLE PASS',
    'LOBBY_WEAPON_ROYALE': 'WEAPON ROYALE',
    'LOBBY_LUCK_ROYALE': 'LUCK ROYALE',
    'LOBBY_PROFILE': 'PROFILE',
    'LOBBY_INVENTORY': 'INVENTORY',
    'CHARACTER_ADAM': 'Adam',
    'CHARACTER_ADAM_DESC': 'The original survivor.',
    'CHARACTER_KELLY': 'Kelly',
    'CHARACTER_KELLY_DESC': 'A professional sprinter.',
    'CHARACTER_ANDREW': 'Andrew',
    'CHARACTER_ANDREW_DESC': 'Armor repair specialist.',
    'CHARACTER_MOCO': 'Moco',
    'CHARACTER_MOCO_DESC': 'An outstanding hacker.',
    'CHARACTER_MAXIM': 'Maxim',
    'CHARACTER_MAXIM_DESC': 'Eats fast and recovers quickly.',
    'WEAPON_M4A1': 'M4A1',
    'WEAPON_AK47': 'AK47',
    'WEAPON_MP40': 'MP40',
    'WEAPON_AWM': 'AWM',
    'WEAPON_M1887': 'M1887',
    'WEAPON_SCAR': 'SCAR',
    'WEAPON_GRENADE': 'Grenade',
    'WEAPON_MEDKIT': 'Med Kit',
    'MODE_SOLO': 'Solo',
    'MODE_DUO': 'Duo',
    'MODE_SQUAD': 'Squad',
    'SHOP_BUY': 'BUY',
    'SHOP_EQUIP': 'EQUIP',
    'SHOP_PRICE': 'Price',
    'SHOP_OWNED': 'OWNED',
    'SHOP_NOT_ENOUGH_GOLD': 'Not enough gold!',
    'SHOP_PURCHASE_SUCCESS': 'Purchase successful!',
    'MATCHMAKING_SEARCHING': 'Searching for a match...',
    'MATCHMAKING_FOUND': 'Match found!',
    'MATCHMAKING_CANCEL': 'Cancel',
    'MATCHMAKING_QUEUE_JOINED': 'You joined the queue.',
    'MATCH_START': 'The match is about to start!',
    'MATCH_END': 'Match ended!',
    'MATCH_WINNER': 'Winner',
    'MATCH_KILLS': 'Kills',
    'MATCH_DAMAGE': 'Damage',
    'MATCH_REWARDS': 'Rewards',
    'GENERAL_OK': 'OK',
    'GENERAL_CANCEL': 'CANCEL',
    'GENERAL_CONFIRM': 'CONFIRM',
    'GENERAL_BACK': 'BACK',
    'GENERAL_SETTINGS': 'SETTINGS',
    'GENERAL_LANGUAGE': 'LANGUAGE',
    'GENERAL_GRAPHICS': 'GRAPHICS',
    'GENERAL_SENSITIVITY': 'SENSITIVITY',
    'GENERAL_AUDIO': 'AUDIO',
    'GENERAL_CONTROLS': 'CONTROLS',
    'AUTH_LOGIN': 'LOGIN',
    'AUTH_LOGOUT': 'LOGOUT',
    'AUTH_GUEST': 'GUEST',
    'AUTH_REGISTER': 'REGISTER',
    'AUTH_FORGOT_PASSWORD': 'FORGOT PASSWORD?',
    'EVENT_SUMMER_TRAINING': 'Summer Training',
    'EVENT_ADAM_CHALLENGE': 'Adam Challenge',
    'EVENT_DAILY_MISSIONS': 'Daily Missions',
    'NOTIF_MAIL_RECEIVED': 'You have received a new mail.',
    'NOTIF_FRIEND_REQUEST': 'Friend request received.',
    'NOTIF_REWARD_CLAIMED': 'Reward claimed!',
    'SYS_SERVER_ONLINE': 'Server online',
    'SYS_MAINTENANCE': 'Server under maintenance',
    'SYS_VERSION': 'Version',
    'SYS_REGION': 'Region'
  },
  'es': {
    'LOBBY_PLAY': 'JUGAR',
    'LOBBY_STORE': 'TIENDA',
    'LOBBY_SETTINGS': 'CONFIGURACIÓN',
    'LOBBY_MAIL': 'CORREO',
    'LOBBY_FRIENDS': 'AMIGOS',
    'LOBBY_MISSIONS': 'MISIONES',
    'LOBBY_EVENTS': 'EVENTOS',
    'LOBBY_RANKED': 'CLASIFICADO',
    'LOBBY_CLAN': 'CLAN',
    'LOBBY_BATTLEPASS': 'PASE DE BATALLA',
    'LOBBY_WEAPON_ROYALE': 'ROYALE DE ARMAS',
    'LOBBY_LUCK_ROYALE': 'ROYALE DE SUERTE',
    'LOBBY_PROFILE': 'PERFIL',
    'LOBBY_INVENTORY': 'INVENTARIO',
    'CHARACTER_ADAM': 'Adam',
    'CHARACTER_ADAM_DESC': 'El primer sobreviviente.',
    'CHARACTER_KELLY': 'Kelly',
    'CHARACTER_KELLY_DESC': 'Una velocista profesional.',
    'CHARACTER_ANDREW': 'Andrew',
    'CHARACTER_ANDREW_DESC': 'Especialista en reparación de chalecos.',
    'CHARACTER_MOCO': 'Moco',
    'CHARACTER_MOCO_DESC': 'Una hacker sobresaliente.',
    'CHARACTER_MAXIM': 'Maxim',
    'CHARACTER_MAXIM_DESC': 'Come rápido y se recupera.',
    'WEAPON_M4A1': 'M4A1',
    'WEAPON_AK47': 'AK47',
    'WEAPON_MP40': 'MP40',
    'WEAPON_AWM': 'AWM',
    'WEAPON_M1887': 'M1887',
    'WEAPON_SCAR': 'SCAR',
    'WEAPON_GRENADE': 'Granada',
    'WEAPON_MEDKIT': 'Botiquín',
    'MODE_SOLO': 'Solitario',
    'MODE_DUO': 'Dúo',
    'MODE_SQUAD': 'Escuadrón',
    'SHOP_BUY': 'COMPRAR',
    'SHOP_EQUIP': 'EQUIPAR',
    'SHOP_PRICE': 'Precio',
    'SHOP_OWNED': 'ADQUIRIDO',
    'SHOP_NOT_ENOUGH_GOLD': '¡Oro insuficiente!',
    'SHOP_PURCHASE_SUCCESS': '¡Compra exitosa!',
    'MATCHMAKING_SEARCHING': 'Buscando partida...',
    'MATCHMAKING_FOUND': '¡Partida encontrada!',
    'MATCHMAKING_CANCEL': 'Cancelar',
    'MATCHMAKING_QUEUE_JOINED': 'Entraste en la cola.',
    'MATCH_START': '¡La partida va a comenzar!',
    'MATCH_END': '¡Partida terminada!',
    'MATCH_WINNER': 'Ganador',
    'MATCH_KILLS': 'Eliminaciones',
    'MATCH_DAMAGE': 'Daño',
    'MATCH_REWARDS': 'Recompensas',
    'GENERAL_OK': 'OK',
    'GENERAL_CANCEL': 'CANCELAR',
    'GENERAL_CONFIRM': 'CONFIRMAR',
    'GENERAL_BACK': 'VOLVER',
    'GENERAL_SETTINGS': 'CONFIGURACIÓN',
    'GENERAL_LANGUAGE': 'IDIOMA',
    'GENERAL_GRAPHICS': 'GRÁFICOS',
    'GENERAL_SENSITIVITY': 'SENSIBILIDAD',
    'GENERAL_AUDIO': 'AUDIO',
    'GENERAL_CONTROLS': 'CONTROLES',
    'AUTH_LOGIN': 'INICIAR SESIÓN',
    'AUTH_LOGOUT': 'CERRAR SESIÓN',
    'AUTH_GUEST': 'INVITADO',
    'AUTH_REGISTER': 'REGISTRARSE',
    'AUTH_FORGOT_PASSWORD': '¿OLVIDASTE LA CONTRASEÑA?',
    'EVENT_SUMMER_TRAINING': 'Entrenamiento de Verano',
    'EVENT_ADAM_CHALLENGE': 'Desafío de Adam',
    'EVENT_DAILY_MISSIONS': 'Misiones Diarias',
    'NOTIF_MAIL_RECEIVED': 'Has recibido un nuevo correo.',
    'NOTIF_FRIEND_REQUEST': 'Solicitud de amistad recibida.',
    'NOTIF_REWARD_CLAIMED': '¡Recompensa reclamada!',
    'SYS_SERVER_ONLINE': 'Servidor en línea',
    'SYS_MAINTENANCE': 'Servidor en mantenimiento',
    'SYS_VERSION': 'Versión',
    'SYS_REGION': 'Región'
  },
  'id': {
    'LOBBY_PLAY': 'MAIN',
    'LOBBY_STORE': 'TOKO',
    'LOBBY_SETTINGS': 'PENGATURAN',
    'LOBBY_MAIL': 'SURAT',
    'LOBBY_FRIENDS': 'TEMAN',
    'LOBBY_MISSIONS': 'MISI',
    'LOBBY_EVENTS': 'ACARA',
    'LOBBY_RANKED': 'PERINGKAT',
    'LOBBY_CLAN': 'KLEN',
    'LOBBY_BATTLEPASS': 'BATTLE PASS',
    'LOBBY_WEAPON_ROYALE': 'ROYALE SENJATA',
    'LOBBY_LUCK_ROYALE': 'ROYALE KEBERUNTUNGAN',
    'LOBBY_PROFILE': 'PROFIL',
    'LOBBY_INVENTORY': 'INVENTARIS',
    'CHARACTER_ADAM': 'Adam',
    'CHARACTER_ADAM_DESC': 'Penyintas pertama.',
    'CHARACTER_KELLY': 'Kelly',
    'CHARACTER_KELLY_DESC': 'Pelari cepat profesional.',
    'CHARACTER_ANDREW': 'Andrew',
    'CHARACTER_ANDREW_DESC': 'Spesialis perbaikan rompi.',
    'CHARACTER_MOCO': 'Moco',
    'CHARACTER_MOCO_DESC': 'Hacker yang luar biasa.',
    'CHARACTER_MAXIM': 'Maxim',
    'CHARACTER_MAXIM_DESC': 'Makan cepat dan pulih dengan cepat.',
    'WEAPON_M4A1': 'M4A1',
    'WEAPON_AK47': 'AK47',
    'WEAPON_MP40': 'MP40',
    'WEAPON_AWM': 'AWM',
    'WEAPON_M1887': 'M1887',
    'WEAPON_SCAR': 'SCAR',
    'WEAPON_GRENADE': 'Granat',
    'WEAPON_MEDKIT': 'Kit Medis',
    'MODE_SOLO': 'Solo',
    'MODE_DUO': 'Duo',
    'MODE_SQUAD': 'Skuad',
    'SHOP_BUY': 'BELI',
    'SHOP_EQUIP': 'PAKAI',
    'SHOP_PRICE': 'Harga',
    'SHOP_OWNED': 'DIMILIKI',
    'SHOP_NOT_ENOUGH_GOLD': 'Emas tidak cukup!',
    'SHOP_PURCHASE_SUCCESS': 'Pembelian berhasil!',
    'MATCHMAKING_SEARCHING': 'Mencari pertandingan...',
    'MATCHMAKING_FOUND': 'Pertandingan ditemukan!',
    'MATCHMAKING_CANCEL': 'Batal',
    'MATCHMAKING_QUEUE_JOINED': 'Anda masuk antrean.',
    'MATCH_START': 'Pertandingan akan dimulai!',
    'MATCH_END': 'Pertandingan selesai!',
    'MATCH_WINNER': 'Pemenang',
    'MATCH_KILLS': 'Eliminasi',
    'MATCH_DAMAGE': 'Kerusakan',
    'MATCH_REWARDS': 'Hadiah',
    'GENERAL_OK': 'OK',
    'GENERAL_CANCEL': 'BATAL',
    'GENERAL_CONFIRM': 'KONFIRMASI',
    'GENERAL_BACK': 'KEMBALI',
    'GENERAL_SETTINGS': 'PENGATURAN',
    'GENERAL_LANGUAGE': 'BAHASA',
    'GENERAL_GRAPHICS': 'GRAFIS',
    'GENERAL_SENSITIVITY': 'SENSITIVITAS',
    'GENERAL_AUDIO': 'AUDIO',
    'GENERAL_CONTROLS': 'KONTROL',
    'AUTH_LOGIN': 'MASUK',
    'AUTH_LOGOUT': 'KELUAR',
    'AUTH_GUEST': 'TAMU',
    'AUTH_REGISTER': 'DAFTAR',
    'AUTH_FORGOT_PASSWORD': 'LUPA KATA SANDI?',
    'EVENT_SUMMER_TRAINING': 'Latihan Musim Panas',
    'EVENT_ADAM_CHALLENGE': 'Tantangan Adam',
    'EVENT_DAILY_MISSIONS': 'Misi Harian',
    'NOTIF_MAIL_RECEIVED': 'Anda menerima surat baru.',
    'NOTIF_FRIEND_REQUEST': 'Permintaan pertemanan diterima.',
    'NOTIF_REWARD_CLAIMED': 'Hadiah diklaim!',
    'SYS_SERVER_ONLINE': 'Server online',
    'SYS_MAINTENANCE': 'Server dalam pemeliharaan',
    'SYS_VERSION': 'Versi',
    'SYS_REGION': 'Wilayah'
  },
  'th': {
    'LOBBY_PLAY': 'เล่น',
    'LOBBY_STORE': 'ร้านค้า',
    'LOBBY_SETTINGS': 'ตั้งค่า',
    'LOBBY_MAIL': 'จดหมาย',
    'LOBBY_FRIENDS': 'เพื่อน',
    'LOBBY_MISSIONS': 'ภารกิจ',
    'LOBBY_EVENTS': 'กิจกรรม',
    'LOBBY_RANKED': 'จัดอันดับ',
    'LOBBY_CLAN': 'แคลน',
    'LOBBY_BATTLEPASS': 'BATTLE PASS',
    'LOBBY_WEAPON_ROYALE': 'ROYALE อาวุธ',
    'LOBBY_LUCK_ROYALE': 'ROYALE โชคดี',
    'LOBBY_PROFILE': 'โปรไฟล์',
    'LOBBY_INVENTORY': 'กระเป๋า',
    'CHARACTER_ADAM': 'อดัม',
    'CHARACTER_ADAM_DESC': 'ผู้รอดชีวิตคนแรก',
    'CHARACTER_KELLY': 'เคลลี่',
    'CHARACTER_KELLY_DESC': 'นักวิ่งมืออาชีพ',
    'CHARACTER_ANDREW': 'แอนดรูว์',
    'CHARACTER_ANDREW_DESC': 'ผู้เชี่ยวชาญการซ่อมเกราะ',
    'CHARACTER_MOCO': 'โมโค',
    'CHARACTER_MOCO_DESC': 'แฮกเกอร์ที่ยอดเยี่ยม',
    'CHARACTER_MAXIM': 'แม็กซิม',
    'CHARACTER_MAXIM_DESC': 'กินเร็วและฟื้นตัวอย่างรวดเร็ว',
    'WEAPON_M4A1': 'M4A1',
    'WEAPON_AK47': 'AK47',
    'WEAPON_MP40': 'MP40',
    'WEAPON_AWM': 'AWM',
    'WEAPON_M1887': 'M1887',
    'WEAPON_SCAR': 'SCAR',
    'WEAPON_GRENADE': 'ระเบิด',
    'WEAPON_MEDKIT': 'ชุดแพทย์',
    'MODE_SOLO': 'เดี่ยว',
    'MODE_DUO': 'คู่',
    'MODE_SQUAD': 'ทีม',
    'SHOP_BUY': 'ซื้อ',
    'SHOP_EQUIP': 'สวมใส่',
    'SHOP_PRICE': 'ราคา',
    'SHOP_OWNED': 'เป็นเจ้าของ',
    'SHOP_NOT_ENOUGH_GOLD': 'ทองไม่พอ!',
    'SHOP_PURCHASE_SUCCESS': 'ซื้อสำเร็จ!',
    'MATCHMAKING_SEARCHING': 'กำลังค้นหาการแข่งขัน...',
    'MATCHMAKING_FOUND': 'พบการแข่งขัน!',
    'MATCHMAKING_CANCEL': 'ยกเลิก',
    'MATCHMAKING_QUEUE_JOINED': 'คุณเข้าคิวแล้ว',
    'MATCH_START': 'การแข่งขันกำลังจะเริ่ม!',
    'MATCH_END': 'การแข่งขันสิ้นสุด!',
    'MATCH_WINNER': 'ผู้ชนะ',
    'MATCH_KILLS': 'สังหาร',
    'MATCH_DAMAGE': 'ความเสียหาย',
    'MATCH_REWARDS': 'รางวัล',
    'GENERAL_OK': 'ตกลง',
    'GENERAL_CANCEL': 'ยกเลิก',
    'GENERAL_CONFIRM': 'ยืนยัน',
    'GENERAL_BACK': 'กลับ',
    'GENERAL_SETTINGS': 'ตั้งค่า',
    'GENERAL_LANGUAGE': 'ภาษา',
    'GENERAL_GRAPHICS': 'กราฟิก',
    'GENERAL_SENSITIVITY': 'ความไว',
    'GENERAL_AUDIO': 'เสียง',
    'GENERAL_CONTROLS': 'ควบคุม',
    'AUTH_LOGIN': 'เข้าสู่ระบบ',
    'AUTH_LOGOUT': 'ออกจากระบบ',
    'AUTH_GUEST': 'ผู้เล่นทั่วไป',
    'AUTH_REGISTER': 'ลงทะเบียน',
    'AUTH_FORGOT_PASSWORD': 'ลืมรหัสผ่าน?',
    'EVENT_SUMMER_TRAINING': 'การฝึกฤดูร้อน',
    'EVENT_ADAM_CHALLENGE': 'ความท้าทายของอดัม',
    'EVENT_DAILY_MISSIONS': 'ภารกิจรายวัน',
    'NOTIF_MAIL_RECEIVED': 'คุณได้รับจดหมายใหม่',
    'NOTIF_FRIEND_REQUEST': 'ได้รับคำขอเป็นเพื่อน',
    'NOTIF_REWARD_CLAIMED': 'รับรางวัลแล้ว!',
    'SYS_SERVER_ONLINE': 'เซิร์ฟเวอร์ออนไลน์',
    'SYS_MAINTENANCE': 'เซิร์ฟเวอร์กำลังบำรุงรักษา',
    'SYS_VERSION': 'เวอร์ชัน',
    'SYS_REGION': 'ภูมิภาค'
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

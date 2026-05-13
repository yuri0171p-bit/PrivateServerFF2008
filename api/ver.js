// api/ver.js
const url = require('url');

module.exports = (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const query = url.parse(req.url, true).query;
    const config = {
        appstore_url: 'https://discord.gg/projectreverger',
        billboard_msg: 'yhz o mais lindo',
        cdn_url: 'https://dl.cdn.freefiremobile.com/live/ABHotUpdates/',
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
        server_url: 'https://connect.barbosasmobile.com/',
        version: query.version || '1.25.3',
        lang: query.lang || 'pt-br',
        device: query.device || 'android',
        appstore: query.appstore || 'googleplay',
        region: query.region || 'DEFAULT',
        account_id: query.account_id || '99999999',
        nickname: query.nickname || 'yhzvip38_ks',
        session_key: query.session_key || 'yhzvip38_ks_Session_Key_2026!!',
        access_token: query.access_token || 'yhzvip38_ks_Access_Token_2026!!',
        openid: query.openid || '99999999',
        user_id: parseInt(query.user_id) || 99999999,
        level: parseInt(query.level) || 75,
        gold: parseInt(query.gold) || 9999999,
        diamond: parseInt(query.diamond) || 9999999,
        bp: parseInt(query.bp) || 9999999,
        lobby_ip: query.lobby_ip || '127.0.0.1',
        lobby_port: parseInt(query.lobby_port) || 60000,
        matchmake_ip: query.matchmake_ip || '127.0.0.1',
        matchmake_port: parseInt(query.matchmake_port) || 60000,
        game_ip: query.game_ip || '127.0.0.1',
        game_port: parseInt(query.game_port) || 60000,
        server_time: Math.floor(Date.now() / 1000),
        timestamp: Math.floor(Date.now() / 1000),
        login_time: Math.floor(Date.now() / 1000),
        expires_in: 86400,
        expire_time: Math.floor(Date.now() / 1000) + 86400,
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
    const body = JSON.stringify(config);
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
};

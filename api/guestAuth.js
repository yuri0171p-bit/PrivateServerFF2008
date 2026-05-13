// api/guestAuth.js
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }
    const now = Math.floor(Date.now() / 1000);
    const data = {
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
    const body = JSON.stringify(data);
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
};

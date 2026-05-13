// api/PlatformLogin.js
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }
    const body = JSON.stringify({
        code: 0,
        message: "SUCCESS",
        access_token: "yhzvip38_ks_Access_Token_2026!!",
        openid: "99999999",
        nickname: "yhzvip38_ks"
    });
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
};

// api/appInfo.js
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }
    const data = {
        code: 0,
        version: "1.25.3",
        remote_version: "1.25.3",
        appstore_url: "https://play.google.com/store/apps/details?id=com.dts.freefireth",
        cdn_url: "https://dl.cdn.freefiremobile.com/live/ABHotUpdates/",
        is_server_open: true,
        server_url: "https://connect.barbosasmobile.com/"
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

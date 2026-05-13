// api/facebook.js
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }
    const data = {
        android_dialog_configs: {},
        android_sdk_error_categories: [],
        gdpv4_nux_content: {},
        gdpv4_nux_enabled: false,
        id: ":443",
        supports_implicit_sdk_logging: true
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

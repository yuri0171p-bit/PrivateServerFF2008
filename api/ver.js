// api/ver.js
module.exports = async (req, res) => {
    // CORS (opcional, mas recomendado)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Configuração padrão que o jogo espera
        const config = {
            status: "online",
            version: "1.43.0",
            server_url: "https://private-server-ff-2008-ou4z.vercel.app/",
            cdn_url: "https://cdn.barbosasmobile.com/",
            remote_version: "1.43.0",
            is_server_open: true,
            use_login_optional: true
        };

        res.status(200).json(config);
    } catch (error) {
        console.error('[ver.js] Erro:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

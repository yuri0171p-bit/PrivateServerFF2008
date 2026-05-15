/*
 * Função para construir uma resposta Protobuf completa para o login,
 * baseada no platformLogin.js que você encontrou.
 * 
 * Ela usa o encodeProtobuf já existente no main.js e retorna um Buffer
 * que pode ser enviado diretamente com binaryResponse().
 */

function buildProtobufResponse(userData) {
    const now = Math.floor(Date.now() / 1000);

    // Valores padrão, mesclados com os dados recebidos do usuário
    const defaults = {
        id: 10021659,                          // account id
        reg: "BR",                             // região
        gldia: 0,                              // gold diário?
        nick: "Survival",                      // apelido
        cat: 1761013131,                       // timestamp de criação da conta
        lv1: 8,                                // level (corrigido de "Iv1" para "lv1")
        exp: 8,                                // experiência
        gems: 24,                              // diamantes
        coins: 23,                             // gold
        cs: "136.112.160.226:16700",           // chat server
        tk: "aaeff123-3b15-4967-a59b-347da78738c0",  // token de acesso
        ttl: 3600,                             // tempo de vida do token (segundos)
        vs: "34.68.69.154:80"                  // version server (IP:porta)
    };

    // Mescla com os dados fornecidos
    const data = Object.assign({}, defaults, userData);

    // Funções auxiliares para garantir tipos corretos
    const asInt = (v, d) => (v === undefined || v === null) ? d : Math.floor(Number(v));
    const asStr = (v, d) => (v === undefined || v === null) ? d : String(v);

    // Monta o objeto no formato que o encodeProtobuf espera
    // Os números das chaves correspondem aos campos do .proto
    const protoObj = {
        1: asInt(data.id, 10021659),           // id
        2: asStr(data.reg, "BR"),              // região
        3: asInt(data.gldia, 0),               // gold diário
        4: asStr(data.nick, "Survival"),       // apelido
        5: asInt(data.cat, 1761013131),        // created at
        6: asInt(data.lv1, 1),                 // level (corrigido)
        7: asInt(data.exp, 0),                 // experiência
        8: asInt(data.gems, 0),                // diamantes
        9: asInt(data.coins, 0),               // gold
        10: asStr(data.cs, "127.0.0.1:16700"), // chat server
        11: asStr(data.tk, ""),                // token
        12: asInt(data.ttl, 3600),             // ttl
        13: asStr(data.vs, "127.0.0.1:80")     // version server
    };

    // Converte para buffer Protobuf
    return encodeProtobuf(protoObj);
}

// ============================================================================
// EXEMPLO DE USO NA ROTA /login (substitui o trecho antigo)
// ============================================================================
if (route === '/login' && req.method === 'POST') {
    let body = Buffer.alloc(0);
    req.on('data', chunk => body = Buffer.concat([body, chunk]));
    req.on('end', () => {
        try {
            // Decodifica a requisição do cliente (Protobuf)
            const loginReq = decodeProtobuf(body);
            console.log('[LOGIN] Payload recebido:', JSON.stringify(loginReq, (k, v) => typeof v === 'bigint' ? v.toString() : v));

            // Extrai o open_id ou usa o padrão
            const openId = loginReq['1']?.toString() || playerProgress.open_id || '1548azqj8f0t1s2jx5algbiuze72vgzk';

            // Monta os dados do usuário (você pode carregar do playerProgress atual)
            const userData = {
                id: parseInt(playerProgress.uid),
                nick: playerProgress.nickname,
                lv1: playerProgress.level,
                exp: playerProgress.exp,
                gems: playerProgress.diamonds,
                coins: playerProgress.gold,
                tk: generateToken('tk'),
                cs: playerProgress.chat_server || "127.0.0.1:16700",
                vs: playerProgress.game_server_id || "127.0.0.1:80"
            };

            // Gera a resposta Protobuf
            const responseBuffer = buildProtobufResponse(userData);

            // Envia como binário
            return binaryResponse(res, responseBuffer);
        } catch (e) {
            console.error('[LOGIN] Erro:', e.message);
            const errorResponse = encodeProtobuf({ 1: 'Erro interno' });
            return binaryResponse(res, errorResponse, 500);
        }
    });
    return;
}

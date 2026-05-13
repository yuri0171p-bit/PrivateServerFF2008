// api/GetActivityDesc.js
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }
    const now = Math.floor(Date.now() / 1000);
    const newsList = [
        { title: "Nova Temporada", image_url: "https://example.com/img1.jpg", link_url: "", brief: "Comece já!", start_time: now, end_time: now + 86400 * 30, order_in_this_language: 1, region: "BR", language: "pt-BR" },
        { title: "Evento de Ouro", image_url: "https://example.com/img2.jpg", link_url: "", brief: "Ganhe mais ouro!", start_time: now, end_time: now + 86400 * 15, order_in_this_language: 2, region: "BR", language: "pt-BR" }
    ];
    const response = {
        "1": newsList.map(news => ({
            "1": {
                "1": news.language || "pt-BR",
                "2": 1,
                "3": news.title,
                "5": news.image_url,
                "7": news.image_url,
                "8": news.link_url || "",
                "9": news.brief || news.title,
                "10": now,
                "11": news.end_time || (now + 86400 * 30),
                "12": news.region || "BR",
                "13": 1,
                "14": 1
            }
        })),
        "2": {
            "1": {
                "1": "BR",
                "2": "pt-BR",
                "3": 1,
                "4": newsList[0].title,
                "5": 1,
                "6": now,
                "7": newsList[0].end_time || (now + 86400 * 30)
            }
        }
    };
    const body = JSON.stringify(response);
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Server': 'Garena-Lobby-Server',
        'Connection': 'close',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
};

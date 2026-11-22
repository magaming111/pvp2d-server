
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("PVP_G2D Server is running!");
});

const wss = new WebSocket.Server({ server });

let waitingPlayers = [];
let rooms = new Map();
let nextRoomId = 1;

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function removeFromQueue(ws) {
    waitingPlayers = waitingPlayers.filter(p => p !== ws);
}

function leaveRoom(ws) {
    const roomId = ws.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
        for (const player of room.players) {
            if (player !== ws) {
                send(player, { type: "opponent_left" });
                player.roomId = null;
            }
        }
        rooms.delete(roomId);
    }

    ws.roomId = null;
}

function findMatch(ws) {
    if (ws.roomId) return;

    removeFromQueue(ws);

    while (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift();

        if (
            opponent !== ws &&
            opponent.readyState === WebSocket.OPEN &&
            !opponent.roomId
        ) {
            const roomId = "room_" + nextRoomId++;

            rooms.set(roomId, {
                players: [opponent, ws]
            });

            opponent.roomId = roomId;
            ws.roomId = roomId;

            send(opponent, {
                type: "matched",
                roomId,
                playerIndex: 1
            });

            send(ws, {
                type: "matched",
                roomId,
                playerIndex: 2
            });

            return;
        }
    }

    waitingPlayers.push(ws);
    send(ws, { type: "searching" });
}

wss.on("connection", ws => {
    ws.roomId = null;

    send(ws, { type: "connected" });

    ws.on("message", message => {
        let data;

        try {
            data = JSON.parse(message);
        } catch {
            return;
        }

        if (data.type === "find") {
            findMatch(ws);
        }

        else if (data.type === "cancel") {
            removeFromQueue(ws);
            leaveRoom(ws);
            send(ws, { type: "cancelled" });
        }

        else if (data.type === "state") {
            const room = rooms.get(ws.roomId);
            if (!room) return;

            for (const player of room.players) {
                if (player !== ws) {
                    send(player, {
                        type: "state",
                        data: data.data
                    });
                }
            }
        }
    });

    ws.on("close", () => {
        removeFromQueue(ws);
        leaveRoom(ws);
    });

    ws.on("error", () => {
        removeFromQueue(ws);
        leaveRoom(ws);
    });
});

server.listen(PORT, () => {
    console.log("PVP_G2D server running on port " + PORT);
});
  

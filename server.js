const WebSocket = require('ws');

// Render automatically assigns a port via process.env.PORT. We must use it.
const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

// Global state cache to remember where objects are when a new user joins
const globalSceneState = {};
const activeLocks = {};

server.on('connection', (ws) => {
    console.log('A Unity Editor instance has connected.');

    // Immediately send the existing scene state to the newly connected user
    if (Object.keys(globalSceneState).length > 0) {
        ws.send(JSON.stringify({
            op: 'BULK_INITIAL_SYNC',
            state: globalSceneState
        }));
    }

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message);
            
            switch (packet.op) {
                case 'TRANSFORM_UPDATE':
                    // Update server's master copy of this object
                    globalSceneState[packet.netId] = {
                        name: packet.name,
                        pos: packet.pos,
                        rot: packet.rot,
                        scale: packet.scale
                    };
                    // Broadcast the change to every other connected editor
                    broadcastToOthers(ws, packet);
                    break;

                case 'ACQUIRE_LOCK':
                    if (!activeLocks[packet.netId] || activeLocks[packet.netId] === packet.user) {
                        activeLocks[packet.netId] = packet.user;
                        broadcast({ op: 'LOCK_GRANTED', netId: packet.netId, user: packet.user });
                    } else {
                        ws.send(JSON.stringify({ op: 'LOCK_DENIED', netId: packet.netId, owner: activeLocks[packet.netId] }));
                    }
                    break;

                case 'RELEASE_LOCK':
                    if (activeLocks[packet.netId] === packet.user) {
                        delete activeLocks[packet.netId];
                        broadcast({ op: 'LOCK_RELEASED', netId: packet.netId });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing network packet:', error);
        }
    });

    ws.on('close', () => {
        console.log('A Unity Editor instance disconnected.');
    });
});

function broadcast(packet) {
    const rawData = JSON.stringify(packet);
    server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(rawData);
        }
    });
}

function broadcastToOthers(sender, packet) {
    const rawData = JSON.stringify(packet);
    server.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(rawData);
        }
    });
}

console.log(`Collab Server running securely on port ${PORT}`);

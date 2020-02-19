var handlingFunctions = {
    handleHelloRequest: async function(ws, message) {
        let response = { type: "hello", role: "response" }
        let connectionId = getClientIdForSocket(ws)
        response.message_id = message.message_id
        response.result = {
            status: 200,
            peer_id: connectionId
        }
        ws.send(JSON.stringify(response));
    },
    
    handlePingRequest: async function(ws, message) {
        let response = {  type: "pong", role: "response" }
        response.message_id = message.message_id
        ws.send(JSON.stringify(response))
    },

    handleDirectMessageRequest: async function(ws, message) {
        let peerId = message.peer_id
        let connectionId = getClientIdForSocket(ws)
        let response = { type: "directMessage", role: "response" }
        let messageId = message.message_id
        response.message_id = messageId

        if (typeof peerId == "string") {
            let directMessage = { type: "directMessage", role: "notification", message_id: messageId }
            directMessage.notification = {
                sender_id: connectionId,
                message: message.message
            }
            let peerWs = connectedClients[peerId]
            if (peerWs) {
                peerWs.send(JSON.stringify(directMessage))
                response.result = {
                    status: 200,
                    message: "Sent"
                }
            }
            else {
                response.result = {
                    status: 410,
                    message: "Peer not connected"
                }
            }
        } 
        else {
            response.result = {
                status: 400,
                message: "Missing 'peer_id' value in request"
            }
        }
        ws.send(JSON.stringify(response))
    }
}

var connectedClients = {}
var clientId = 1234

module.exports = function(port) {
    var WebSocketServer = require('ws').Server;
    var wss = new WebSocketServer({ port: port });
    
    wss.on('connection', function (ws) {
        const cid = `${clientId++}`
        connectedClients[cid] = ws

        ws.on('message', function (data) {
            const message = JSON.parse(data);
            const handlingFunctionName = "handle" + capitalize(message.type) + capitalize(message.role)
            
            const handlingFunction = handlingFunctions[handlingFunctionName]
            if (typeof handlingFunction != "function") {
                throw new Error("Don't know how to handle message with type " + message.type + " and role " + message.role)
            }
        
            handlingFunction.call(this, ws, message)
        });
        ws.on('close', function(){
            delete connectedClients[cid]
        })
    });
    return wss
}



function getClientIdForSocket(ws) {
    return Object.keys(connectedClients).find(key => connectedClients[key] === ws);
}

function capitalize(s) {
    if (typeof s == "string" && s.length > 0) {
        return s.charAt(0).toUpperCase() + s.substring(1)
    }
    return s
}
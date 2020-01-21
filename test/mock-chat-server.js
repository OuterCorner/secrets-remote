var handlingFunctions = {
    handleHelloRequest: async function(ws, message) {
        let response = { type: "hello", role: "response" }
        let connectionId = getClientIdForSocket(ws)
        response.messageId = message.messageId
        response.result = {
            status: 200,
            peerId: connectionId
        }
        ws.send(JSON.stringify(response));
    },
    
    handlePingRequest: async function(ws, message) {
        let response = {  type: "pong", role: "response" }
        response.messageId = message.messageId
        ws.send(JSON.stringify(response))
    },

    handleDirectMessageRequest: async function(ws, message) {
        let peerId = message.peerId
        let connectionId = getClientIdForSocket(ws)
        let response = { type: "directMessage", role: "response" }
        response.messageId = message.messageId

        if (typeof peerId == "string") {
            let directMessage = { type: "directMessage", role: "notification" }
            directMessage.notification = {
                senderId: connectionId,
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
                    status: e.statusCode,
                    message: (e.statusCode === 410) ? "Peer not connected" : e.message
                }
            }
        } 
        else {
            response.result = {
                status: 400,
                message: "Missing 'peerId' value in request"
            }
        }
        ws.send(JSON.stringify(response))
    }
}

var connectedClients = {}
var clientId = 0

module.exports = function(port) {
    var WebSocketServer = require('ws').Server;
    var wss = new WebSocketServer({ port: port });
    
    wss.on('connection', function (ws) {
        connectedClients[`${clientId++}`] = ws

        ws.on('message', function (data) {
            const message = JSON.parse(data);
            const handlingFunctionName = "handle" + capitalize(message.type) + capitalize(message.role)
            
            const handlingFunction = handlingFunctions[handlingFunctionName]
            if (typeof handlingFunction != "function") {
                throw new Error("Don't know how to handle message with type " + message.type + " and role " + message.role)
            }
        
            handlingFunction.call(this, ws, message)
        });
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
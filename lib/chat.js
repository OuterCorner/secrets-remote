const { once, EventEmitter } = require('events')
const WebSocket = require('isomorphic-ws')
const base64js = require('base64-js')
const { DeferredPromise } = require('./util')
const { NoiseSession } = require('./npf');

class ChatClient extends EventEmitter {
    
    constructor(address) {
        super()
        this._connected = new DeferredPromise()
        this._messageId = 0

        const ws = new WebSocket(address)
        const responseEmitter = new EventEmitter()
        ws.onopen = () => { 
            ws.onerror = undefined
            this._connected.resolve(this)
        }
        ws.onerror = error => { 
            this._connected.reject(error) 
        }
        ws.onmessage = (payload) => {
            const msg = JSON.parse(payload.data)
            if (msg.role == 'response') {
                responseEmitter.emit(msg.messageId, msg)
            }
            else {
                this.emit(msg.type, msg)
            }
        }
        this.responses = responseEmitter
        this._ws = ws
    }

    async connected() {
        return this._connected.promise
    }

    async request(msg) {
        const msgId = this._messageId++
        msg.messageId = msgId
        msg.role = 'request'

        let p = once(this.responses, msgId).then( responses => {
            const response = responses.shift()
            const statusCode  = response.result.status
            if (statusCode >= 200 && statusCode < 300){
                return response.result
            } else {
                throw new ChatError(statusCode, response.result.message)
            }
        })
        this._ws.send(JSON.stringify(msg))
         
        return p
    }

    close() {
        this._ws.close()
    }
}

class ChatError extends Error {
    constructor(status = 500, ...params) {
        super(...params)

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ChatError)
        }

        this.status = status
    }    
}

// extend Noise session to make it easy to bind with a ChatClient
NoiseSession.prototype.bindToChatClient = function(chatClient, peerId) {
    this.peerId = peerId
    // currently, we're only using the directMessages
    chatClient.on("directMessage", message => {
        const functionName = "handle" + capitalize(message.type) + capitalize(message.role)
        const handlingFunction = chatMessageHandling[functionName]
        if (typeof handlingFunction != "function") {
            console.error("Don't know how to handle message with type " + message.type + " and role " + message.role)
        }
        else {
            try {
                handlingFunction.call(this, message)
            } catch (error) {
                console.error(error)
            }

        }
    })

    this.transportStream.on('data', chunk => {
        const peerId = this.peerId
        if (!peerId) {
            this.abort(new Error("Noise session is sending data but we don't have a peer yet"))
            return
        }
        const b64Message = base64js.fromByteArray(chunk)
        chatClient.request({ type: "directMessage", peerId: peerId, message: b64Message })
            .then(result => {
                if (result.status != 200) {
                    noise.abort(new Error("Failed to send message to server: " + JSON.stringify(result)))
                }
            })
    })

    this.transportStream.on('close', () => {
        chatClient.close()
    })

    this.transportStream.on('error', (error) => {})

    var chatMessageHandling = {
        handleDirectMessageNotification: function (message) {
            const peerId = message.notification.senderId
            if (this.peerId === undefined) {
                if (peerId) {
                    this.peerId = peerId
                }
                else {
                    throw new Error("Missing senderId in notification request")
                }
            } else if (this.peerId != peerId) {
                throw new Error("Unexpected message from peer: " + peerId)
            }
            const b64Message = message.notification.message
            const payload = base64js.toByteArray(b64Message)
            this.transportStream.write(payload)
        }
    }
}

function capitalize(s) {
    if (typeof s == "string" && s.length > 0) {
        return s.charAt(0).toUpperCase() + s.substring(1)
    }
    return s
}


module.exports = { ChatClient, ChatError }
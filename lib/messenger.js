const base64js = require('base64-js')
const { once, EventEmitter } = require('events')
const { ChatError } = require('./chat')

class PeerMessenger extends EventEmitter {
    constructor(chatClient, noiseSession, peerId) {
        super()
        this._peerId = peerId
        this._noiseSession = noiseSession
        this._chatClient = chatClient

        // route incoming messages to the apropriate handler
        chatClient.on("directMessage", this.handleIncomingMessage.bind(this))

        // route outgoing noise messages
        if (noiseSession) {
            noiseSession.transportStream.on('data', this.handleOutgoingNoiseData.bind(this))
        
            // tear down cases
            noiseSession.transportStream.on('error', (error) => {})
            noiseSession.transportStream.on('close', () => {
                chatClient.disconnect()
            })
        }

        // setup keepalive
        this._keepAliveInterval = 3000 // 3 seconds
        this.sendKeepAlive()
    }

    get noiseSession() { return this._noiseSession }
    set noiseSession(session) { this._noiseSession = session }
    get chatClient() { return this._chatClient }
    get peerId() { return this._peerId }
    set peerId(pid) { this._peerId = pid }
    get keepAliveInterval() { return this._keepAliveInterval }
    set keepAliveInterval(interval) {
        this._keepAliveInterval = interval
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }
        this.timeoutId = setTimeout(this.sendKeepAlive.bind(this), this.keepAliveInterval)
    }

    handleIncomingMessage(message) {
        const functionName = "handle" + capitalize(message.type) + capitalize(message.role)
        const handlingFunction = this[functionName]
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
    }

    handleDirectMessageNotification(message) {
        const peerId = message.notification.senderId
        if (this.peerId === undefined) {
            if (peerId) {
                this._peerId = peerId
                this.emit("peerConnected")
            }
            else {
                throw new Error("Missing senderId in notification request")
            }
        } else if (this.peerId != peerId) {
            console.log(`Unexpected message from peer: ${peerId}. Ignoring…`)
            return
        }
        const innerMessage = message.notification.message
        if (innerMessage.channel == "noise") {
            const payload = base64js.toByteArray(innerMessage.payload)
            this.noiseSession.transportStream.write(payload)
        }
        else if (innerMessage.channel == "keepalive") {
            // do nothing
        }
        else {
            this.emit("message", innerMessage)
            throw new Error("Don't know how to handle messages for channel "+innerMessage.channel)
        }
        
    }

    handleOutgoingNoiseData(chunk) {
        const peerId = this.peerId
        if (!peerId) {
            this.noiseSession.abort(new Error("Noise session is sending data but we don't have a peer yet"))
            return
        }
        const b64Message = base64js.fromByteArray(chunk)
        this.sendMessage({ channel: "noise", payload: b64Message })
            .then(result => {
                if (result.status != 200) {
                    this.noiseSession.abort(new Error("Failed to send message to server: " + JSON.stringify(result)))
                }
            })
    }

    sendKeepAlive() {
        const scheduleNextKeepAlive = () => {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId)
            }
            this.timeoutId = setTimeout(this.sendKeepAlive.bind(this), this.keepAliveInterval)
        }
        const peerId = this.peerId
        if (peerId) {
            this
            .sendMessage({ channel: "keepalive" })
            .then( (response) =>  {
                    scheduleNextKeepAlive()
            })
        } else {
            scheduleNextKeepAlive()
        }
    }

    async sendMessage(message) {
        const peerId = this.peerId
        if (!peerId) {
            throw new Error("Peer isn't known yet")
        }
        return this.chatClient
            .request({ type: "directMessage", peerId: peerId, message })
            .catch(error => {
                if (error instanceof ChatError && error.status == 410) {
                    this.emit("peerDisconnect")
                } else {
                    this.disconnect(error)
                }

            })
    }
    disconnect(error) {
        if (this.noiseSession) {
            this.noiseSession.abort(error)
        }
        else {
            this.chatClient.disconnect(error)
        }
    }
}

function capitalize(s) {
    if (typeof s == "string" && s.length > 0) {
        return s.charAt(0).toUpperCase() + s.substring(1)
    }
    return s
}

module.exports = { PeerMessenger }
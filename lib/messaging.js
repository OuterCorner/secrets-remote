const {once, EventEmitter}  = require("events")
const NPF = require('./npf'), NoiseSession = NPF.NoiseSession;
const PM = require('./messenger'), PeerMessenger = PM.PeerMessenger;
const base64js = require('base64-js')

function onceMessageReceived(eventName, filter) {
    return new Promise((resolve, reject) => {
        var listener = function (message) {

            for (key in filter) {
                if (message[key] != filter[key]) {
                    return;
                }
            }
            this.removeListener(eventName, listener)
            resolve(message)
        }
        this.on(eventName, listener)
    })
}

function request(msg) {
    this._util_messageId = this._util_messageId || 0

    if (!this._util_responseEmitter) {
        const re = new EventEmitter()
        this.on("message", (m) => {
            if (m.role == 'response') {
                re.emit(m.message_id, m)
            }
        })
        this._util_responseEmitter = re
    }

    const msgId = this._util_messageId++
    msg.message_id = msgId
    msg.role = 'request'

    let p = once(this._util_responseEmitter, msgId).then( responses => {
        return responses.shift()
    })
    this.sendMessage(msg)
    return p
}

function notify(msg) {
    this._util_messageId = this._util_messageId || 0

    const msgId = this._util_messageId++
    msg.message_id = msgId
    msg.role = 'notification'

    return this.sendMessage(msg)
}

NoiseSession.prototype._onceMessageReceived = onceMessageReceived
NoiseSession.prototype.onceMessageReceived = function (filter) {
    return this._onceMessageReceived("message", filter)
}
NoiseSession.prototype.sendRequestMessage = request;

PeerMessenger.prototype._onceMessageReceived = onceMessageReceived
PeerMessenger.prototype.onceMessageReceived = function (filter) {
    return this._onceMessageReceived("message", filter)
}
PeerMessenger.prototype.onceSetupMessageReceived = function (filter) {
    return this._onceMessageReceived("setupMessage", filter)
}

function string2Bin ( str ) {
    return str.split("").map( function( val ) { 
        return val.charCodeAt( 0 ); 
    } );
}

PeerMessenger.prototype.sendRequestMessage = request;
PeerMessenger.prototype.sendNotificationMessage = notify;
PeerMessenger.prototype.sendSetupMessage = function (msg) {
    return this.sendMessage({
        "channel": "setup",
        "payload": base64js.fromByteArray(string2Bin(JSON.stringify(msg)))
    })
}


module.exports = {
    ...NPF,
    ...PM
}
const NPF = require('./npf'), NoiseSession = NPF.NoiseSession;
const PM = require('./messenger'), PeerMessenger = PM.PeerMessenger;


function onceMessageReceived(filter) {
    return new Promise((resolve, reject) => {
        var listener = function (message) {

            for (key in filter) {
                if (message[key] != filter[key]) {
                    return;
                }
            }
            this.removeListener("message", listener)
            resolve(message)
        }
        this.on("message", listener)
    })
}

function request(msg) {
    this._util_messageId = this._util_messageId || 0

    if (!this._util_responseEmitter) {
        const re = new EventEmitter()
        this.on("message", (m) => {
            if (m.role == 'response') {
                responseEmitter.emit(m.messageId, m)
            }
        })
        this._util_responseEmitter = re
    }

    const msgId = this._util_messageId++
    msg.messageId = msgId
    msg.role = 'request'

    let p = once(this._util_responseEmitter, msgId).then( responses => {
        return responses.shift()
    })
    this.sendMessage(msg)
    return p
}

NoiseSession.prototype.onceMessageReceived = onceMessageReceived;
PeerMessenger.prototype.onceMessageReceived = onceMessageReceived;
NoiseSession.prototype.sendRequestMessage = request;
PeerMessenger.prototype.sendRequestMessage = request;


module.exports = {
    ...NPF,
    ...PM
}
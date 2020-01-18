const { once, EventEmitter } = require('events')
const { ChatClient } = require('./chat')
const secureRandom = require('secure-random')
const base64js = require('base64-js')

exports.pairDevice = async function (serverAddr, staticKeyPair, callback) {

    // connect
    const cc = await new ChatClient(serverAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peerId)

    // generate a random value for this pairing
    const randomBytes = secureRandom(16)
    const randomString = base64js.fromByteArray(randomBytes)

    // inform the caller of pairing info
    callback({
        peerId: myId,
        secret: randomString,
        url: `secrets://rsr/pair?requestor-id=${encodeURIComponent(myId)}&pairing-secret=${encodeURIComponent(randomString)}&channel=chatws`
    })
    
    return randomString
}
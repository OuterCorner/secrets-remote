const { once, EventEmitter } = require('events')
const { ChatClient } = require('./chat')
const secureRandom = require('secure-random')
const base64js = require('base64-js')
const { getNoiseLib } = require('./util')
const { NoiseSession, Constants } = require('./npf');

exports.pairDevice = async function (serverAddr, staticKeyPair, callback) {

    // connect
    const cc = await new ChatClient(serverAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peerId)

    // generate a random value for this pairing
    const psk = secureRandom(32)
    const pskB64 = base64js.fromByteArray(psk)

    // setup noise session
    const noiseLib = await getNoiseLib()
    let noiseSession = new NoiseSession(noiseLib, "NoisePSK_XX_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, null, psk)
    });

    noiseSession.on(Constants.NoiseSessionEvents.STATE_CHANGED, function () {
        console.debug("Pairing server session state: " + noiseSession.state)
    })

    noiseSession.on(Constants.NoiseSessionEvents.MESSAGE_RECEIVED, function (m) {
        console.log("Message received: " + JSON.stringify(m))
    })

    noiseSession.start()    
    

    // inform the caller of pairing info
    callback({
        peerId: myId,
        secret: pskB64,
        url: new URL(`secrets://rsr/pair?requester-id=${encodeURIComponent(myId)}&pairing-secret=${encodeURIComponent(pskB64)}&channel=chatws`)
    })

    // wait for a connection from the client
    //await noiseSession.whenEstablished

    return pskB64
}
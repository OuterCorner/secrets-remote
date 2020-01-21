const { once, EventEmitter } = require('events')
const secureRandom = require('secure-random')
const base64js = require('base64-js')
const { ChatClient } = require('./chat')
const { getNoiseLib } = require('./util')
const { NoiseSession, Constants } = require('./npf');

exports.pairDevice = async function (serverAddr, staticKeyPair, callback) {

    // connect
    const cc = await new ChatClient(serverAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peerId)

    // setup noise session
    const psk = secureRandom(32) // generate a random value for this pairing
    const pskB64 = base64js.fromByteArray(psk)
    const noiseSession = await setupNoiseSession(staticKeyPair, psk, cc)
    
    noiseSession.start()
    
    noiseSession.bindToChatClient(cc)

    // inform the caller of pairing details
    callback({
        peerId: myId,
        secret: pskB64,
        url: new URL(`secrets://rsr/pair?requester-id=${encodeURIComponent(myId)}&pairing-secret=${encodeURIComponent(pskB64)}&channel=chatws`)
    })

    // wait for a connection from the client
    await noiseSession.whenEstablished()

    return pskB64
}

async function setupNoiseSession(staticKeyPair, psk, cc) {
    const noiseLib = await getNoiseLib()
    const noiseSession = new NoiseSession(noiseLib, "NoisePSK_XX_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, null, psk)
    });

    noiseSession.on(Constants.NoiseSessionEvents.STATE_CHANGED, function () {
        console.debug("Pairing server session state: " + noiseSession.state)
    })

    return noiseSession
}
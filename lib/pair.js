const secureRandom = require('secure-random')
const base64js = require('base64-js')
const { ChatClient } = require('./chat')
const { DeferredPromise, getNoiseLib } = require('./util')
const { NoiseSession, PeerMessenger } = require('./messaging')

exports.pairDevice = async function (serverAddr, staticKeyPair, callback) {

    // connect
    const cc = await new ChatClient(serverAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peer_id)

    // setup noise session
    const psk = secureRandom(32) // generate a random value for this pairing
    const pskB64 = base64js.fromByteArray(psk)
    const noiseSession = await setupNoiseSession(staticKeyPair, psk)
    
    noiseSession.start()
    
    noiseSession.messenger = new PeerMessenger(cc, noiseSession)

    const pairingRequest = new DeferredPromise()
    noiseSession.on("message", function(request) {
        if (request.type == 'pair' && request.role == 'request'){
            pairingRequest.resolve(request)
        } else {
            pairingRequest.reject(new Error("Got unexpected message: "+ request))
        }
    })
    // inform the caller of pairing details
    var { deviceName } = callback({
        peerId: myId,
        secret: pskB64,
        url: new URL(`https://secrets.app/rsr/pair?requester-id=${encodeURIComponent(myId)}&pairing-secret=${encodeURIComponent(pskB64)}&channel=chatws`)
    })

    // wait for a connection from the client
    await noiseSession.whenEstablished()

    // wait for pairing request
    const deviceInfo = await pairingRequest.promise.then( req => {
        // send response
        noiseSession.sendMessage({
            message_id: req.message_id,
            type: 'pair',
            role: 'response',
            device_name: deviceName
        })
        return { name: req.device_name, apnsToken: req.apns_token, publicKey: base64js.fromByteArray(noiseSession.remotePublicKey) }
    })
    
    return deviceInfo
}

async function setupNoiseSession(staticKeyPair, psk) {
    const noiseLib = await getNoiseLib()
    const noiseSession = new NoiseSession(noiseLib, "NoisePSK_XX_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, null, psk)
    });

    noiseSession.on("state", function () {
        console.debug("Pairing server session state: " + noiseSession.state)
    })

    return noiseSession
}
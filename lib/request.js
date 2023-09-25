const base64js = require('base64-js')
const secureRandom = require('./crypto/secure-random')
const { ChatClient } = require('./chat')
const { getNoiseLib } = require('./util')
const { NoiseSession } = require('./npf')
const { PeerMessenger } = require('./messenger')

exports.requestSecret = async function (chatServiceAddr, staticKeyPair, notificationService, devices, query) {

    // connect
    const cc = await new ChatClient(chatServiceAddr).connected

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peer_id)

    // send request notification to devices
    const notifiedDevices = await notificationService.notifyDevices(devices, {
        "peer_id": myId,
        "channel": "chatws",
        "channel-addr": chatServiceAddr,
        "type": "secret",
        "public_key": base64js.fromByteArray(staticKeyPair.pub) 
    });
    

    // await hello from a device
    const peerMessenger = new PeerMessenger(cc)
    const peerHello = await peerMessenger.onceSetupMessageReceived({type: "hello", role: "request"})

    // a peer has connected, delete any notifications that may still be appearing on other devices
    notificationService.retractNotification(notifiedDevices)

    // check we have paired with this device
    const device = devices.find(d => d.publicKey == peerHello.public_key )
    if (!device) {
        throw new Error("Connected device's public key is not on file. You may have to perform pairing again.")
    }

    // setup noise session
    const remoteStaticPubKey = base64js.toByteArray(peerHello.public_key)
    const noiseSession = await setupNoiseSession(staticKeyPair, remoteStaticPubKey)
    // noiseSession.on("state", function () {
    //     console.debug("Request server session state: " + noiseSession.state)
    // })
    noiseSession.start()
    peerMessenger.noiseSession = noiseSession

    // say hello back
    peerMessenger.sendSetupMessage({type: "hello", role: "response", message_id: peerHello.message_id })
    // wait for a connection from a device
    await noiseSession.whenEstablished()

    // request secret and wait for response
    const item = await noiseSession.sendRequestMessage({ type: "query", ...query }).then( rsp => rsp.item )

    noiseSession.stop()

    await cc.disconnected
    
    return { secret: item, device }
}

exports.requestAdHocSecret = async function (chatServiceAddr, query, callback) {

    // connect
    const cc = await new ChatClient(chatServiceAddr).connected

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peer_id)

    const psk = secureRandom(32) // generate a random value for this pairing
    const pskB64 = base64js.fromByteArray(psk)

    // inform the caller of adhoc request details
    var requestUrl = new URL(`https://secrets.app/rsr/request?requester-id=${encodeURIComponent(myId)}&channel=chatws&channel-addr=${encodeURIComponent(chatServiceAddr)}&type=secret`)
    // var requestUrl = new URL(`secrets-beta://rsr/request?requester-id=${encodeURIComponent(myId)}&channel=chatws&channel-addr=${encodeURIComponent(chatServiceAddr)}&type=secret`)
    requestUrl.hash = pskB64 // to prevent sending this over the network the pre-shared key secret is sent in the URL fragment
    callback({
        peerId: myId,
        secret: pskB64,
        url: requestUrl
    })

    // await hello from a device
    const peerMessenger = new PeerMessenger(cc)
    const peerHello = await peerMessenger.onceSetupMessageReceived({type: "hello", role: "request"})

    // setup noise session
    const noiseSession = await setupAdHocNoiseSession(psk)
    // noiseSession.on("state", function () {
    //     console.debug("Request server session state: " + noiseSession.state)
    // })
    noiseSession.start()
    peerMessenger.noiseSession = noiseSession

    // say hello back
    peerMessenger.sendSetupMessage({type: "hello", role: "response", message_id: peerHello.message_id })
    // wait for a connection from a device
    await noiseSession.whenEstablished()

    // request secret and wait for response
    const item = await noiseSession.sendRequestMessage({ type: "query", ...query }).then( rsp => rsp.item )

    noiseSession.stop()

    await cc.disconnected
    
    return { secret: item }
}

async function setupNoiseSession(staticKeyPair, remoteStaticPubKey) {
    const noiseLib = await getNoiseLib()
    const noiseSession = new NoiseSession(noiseLib, "Noise_KK_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, remoteStaticPubKey, null)
    });
    return noiseSession
}

async function setupAdHocNoiseSession(psk) {
    const noiseLib = await getNoiseLib()

    const noiseSession = new NoiseSession(noiseLib, "NoisePSK_NN_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, null, null, psk)
    });
    return noiseSession
}


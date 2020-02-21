const base64js = require('base64-js')
const { ChatClient } = require('./chat')
const { getNoiseLib } = require('./util')
const { NoiseSession } = require('./npf')
const { PeerMessenger } = require('./messenger')

exports.requestSecret = async function (chatServiceAddr, staticKeyPair, notificationService, devices, query) {

    // connect
    const cc = await new ChatClient(chatServiceAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peer_id)

    // send request notification to devices
    const { pushId, notifiedDevices } = await notificationService.notifyDevices(devices, {
        "peer_id": myId,
        "channel": "chatws",
        "type": "secret",
        "public_key": base64js.fromByteArray(staticKeyPair.pub) 
    });
    

    // await hello from a device
    const peerMessenger = new PeerMessenger(cc)
    const peerHello = await peerMessenger.onceMessageReceived({type: "hello", role: "notification"})

    // a peer has connected, delete any notifications that may still be appearing on other devices
    notificationService.retractNotification(pushId, notifiedDevices)

    // check we have paired with this device
    if (!devices.find(d => d.publicKey == peerHello.public_key )) {
        throw new Error("Connected device's public key is not on file. You may have to perform pairing again.")
    }

    // setup noise session
    const remoteStaticPubKey = base64js.toByteArray(peerHello.public_key)
    const noiseSession = await setupNoiseSession(staticKeyPair, remoteStaticPubKey)
    noiseSession.start()
    peerMessenger.noiseSession = noiseSession

    // say hello back
    peerMessenger.sendMessage({channel: "setup", type: "hello", role: "response", message_id: peerHello.message_id })
    
    // wait for a connection from a device
    await noiseSession.whenEstablished()

    // request secret and wait for response
    return noiseSession.sendRequestMessage({ type: "query", ...query }).then( rsp => rsp.item )
}


async function setupNoiseSession(staticKeyPair, remoteStaticPubKey) {
    const noiseLib = await getNoiseLib()
    const noiseSession = new NoiseSession(noiseLib, "Noise_KK_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, remoteStaticPubKey, null)
    });

    noiseSession.on("state", function () {
        console.debug("Request server session state: " + noiseSession.state)
    })

    return noiseSession
}


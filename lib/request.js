const base64js = require('base64-js')
const { ChatClient } = require('./chat')
const { DeferredPromise, getNoiseLib } = require('./util')
const { NoiseSession } = require('./npf')
const { PeerMessenger } = require('./messenger')

const PUSH_CHANNEL = 'APNS_SANDBOX'

exports.requestSecret = async function (chatServiceAddr, staticKeyPair, pushService, devices, query, callbacks) {

    // connect
    const cc = await new ChatClient(chatServiceAddr).connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peerId)

    // issue push to notify available devices of this request
    const pushResponse = await pushService
        .post('/push')
        .send({
            devices: devices.map(d => ({ token: d.apnsToken, channel:  PUSH_CHANNEL})),
            payload: {
                peerId: myId,
                channel: "chatws",
                type: "secret",
                pubKey: base64js.fromByteArray(staticKeyPair.pub) 
            }
        }).set('Accept', 'application/json')
    
    var pushId = response.body.push_id
    
    let notifiedDevices = []
    Object.entries(response.body.results).forEach(([deviceToken, result]) => {
        if (result.StatusCode == 200) {
            const notitiedDevice = devices.find(d => d.apnsToken == deviceToken)
            notifiedDevices.push(notitiedDevice)
            const cb = callbacks.notificationSucceededForDevice
            if (cb) {
                cb(notitiedDevice)
            }
        }
        else {
            const failedDevice = devices.find(d => d.apnsToken == deviceToken)
            const statusMessage = JSON.parse(result.StatusMessage)
            const cb = callbacks.notificationFailedForDevice
            if (cb) {
                cb(failedDevice, statusMessage.errorMessage)
            }
        }
    })

    if (notitiedDevices.length == 0) {
        throw new Error("Failed to notify a single device… You may want to clean up your device list and pair again.")
    }

    // await hello from connected peer

    // setup noise session
    const noiseSession = await setupNoiseSession(staticKeyPair)
    noiseSession.start()
    const peerMessenger = new PeerMessenger(cc, noiseSession)

    peerMessenger.on("peerConnected", () => { // delete notifications when a device connects
        pushService
            .delete('/push')
            .send({
                devices: notitiedDevices.map(d => ({ token: d.apnsToken, channel: PUSH_CHANNEL })),
                push_id: pushId
        })
        .set('Accept', 'application/json')
        .end()
    })
    // wait for a connection from a device
    await noiseSession.whenEstablished()

    // request secret and wait for response
    const response = new DeferredPromise()
    noiseSession.on("message", function(m) {
        if (m.type == 'query' && request.role == 'response'){
            response.resolve(m)
        } else {
            response.reject(new Error("Got unexpected message: "+ request))
        }
    })

    noiseSession.sendMessage({
        messageId: 1,
        type: 'query',
        role: 'request',
        ...query
    })

    // wait for response
    let item = await response.promise.then( rsp => rsp.item )
    return item
}


async function setupNoiseSession(staticKeyPair) {
    const noiseLib = await getNoiseLib()
    const noiseSession = new NoiseSession(noiseLib, "Noise_KK_25519_ChaChaPoly_SHA256", noiseLib.constants.NOISE_ROLE_RESPONDER, function (handshake) {
        handshake.Initialize(null, staticKeyPair.priv, null, psk)
    });

    noiseSession.on("state", function () {
        console.debug("Request server session state: " + noiseSession.state)
    })

    return noiseSession
}
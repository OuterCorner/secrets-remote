const assert = require('chai').assert
const base64js = require('base64-js')
const { NoiseSession, ChatClient, PeerMessenger, pairDevice, getNoiseLib } = require('../lib')
const { wait, DeferredPromise } = require('../lib/util')
const startMockChatServer = require('./mock-chat-server')


const chatServerPort = 8085

describe('Pairing devices', function () {

    before(async function () {
        this.chatServer = startMockChatServer(chatServerPort)
        const noise = await getNoiseLib()
        const serverKeys = noise.CreateKeyPair(noise.constants.NOISE_DH_CURVE25519)
        const clientKeys = noise.CreateKeyPair(noise.constants.NOISE_DH_CURVE25519)
        this.noise = noise
        this.serverStaticKeyPair = {
            pub: serverKeys[1],
            priv: serverKeys[0]
        }
        this.clientStaticKeyPair = {
            pub: clientKeys[1],
            priv: clientKeys[0]
        }
    })

    after(function (done) {
        this.chatServer.close(done)
    })

    describe('#pairDeviceSuccess()', function () {
        it('Should return device on successful pairing', async function () {
            try {
                const serverAddr = `ws://localhost:${chatServerPort}`

                // start pairing
                const pairingInfoPromise = new DeferredPromise()
                let pairingPromise = pairDevice(serverAddr, this.serverStaticKeyPair, (pairingInfo) => {
                    pairingInfoPromise.resolve(pairingInfo)
                    return { deviceName: "Requester App" }
                })
                const pairingInfo = await pairingInfoPromise.promise
                assert.typeOf(pairingInfo.peerId, 'string')
                assert.typeOf(pairingInfo.secret, 'string')
                assert.instanceOf(pairingInfo.url, URL)
                assert.equal(pairingInfo.url.protocol, 'https:')
                assert.equal(pairingInfo.url.host, 'secrets.app')
                assert.equal(pairingInfo.url.searchParams.get('requester-id'), pairingInfo.peerId)
                assert.equal(pairingInfo.url.hash.substring(1), pairingInfo.secret)

                // connect a client
                const cc = await new ChatClient(serverAddr).connected
                // setup client noise session
                const noiseSession = new NoiseSession(this.noise, "NoisePSK_XX_25519_ChaChaPoly_SHA256", this.noise.constants.NOISE_ROLE_INITIATOR, handshake => {
                    handshake.Initialize(null, this.clientStaticKeyPair.priv, null, base64js.toByteArray(pairingInfo.secret))
                })
                noiseSession.start()

                noiseSession.messenger = new PeerMessenger(cc, noiseSession, pairingInfo.peerId)

                // wait for handshake to complete
                await noiseSession.whenEstablished()

                // request pairing
                noiseSession.sendMessage({
                    message_id: 1,
                    type: 'pair',
                    role: 'request',
                    device_name: 'Remote App',
                    channel: {
                        type: 'apns',
                        token: '740f4707bebcf74f9b7c25d48e3358945f6aa01da5ddb387462c7eaf61bb78ad',
                        appId: 'com.outercorner.ios.Secrets',
                        environment: 'dev'
                    }   
                })

                
                return pairingPromise.then(device => {
                    assert.isNotNull(device)
                    assert.equal(device.name, 'Remote App')
                    assert.equal(device.channel.token, "740f4707bebcf74f9b7c25d48e3358945f6aa01da5ddb387462c7eaf61bb78ad")
                    assert.equal(device.publicKey, base64js.fromByteArray(this.clientStaticKeyPair.pub))
                })
            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });

    describe('#pairDeviceFailure()', function () {
        it('Should fail on incorrect psk', async function () {
            this.timeout(20000)
            try {
                const serverAddr = `ws://localhost:${chatServerPort}`

                // start pairing
                const pairingInfoPromise = new DeferredPromise()
                let pairingPromise = pairDevice(serverAddr, this.serverStaticKeyPair, (pairingInfo) => {
                    pairingInfoPromise.resolve(pairingInfo)
                    return { deviceName: "Requester App" }
                })
                const pairingInfo = await pairingInfoPromise.promise

                const bogusPsk = "smL2lknkEQDeD++EuctCvfiNuaCPQHNPvmVaYTHzEIY="

                // connect a client
                const cc = await new ChatClient(serverAddr).connected
                // setup client noise session
                const noiseSession = new NoiseSession(this.noise, "NoisePSK_XX_25519_ChaChaPoly_SHA256", this.noise.constants.NOISE_ROLE_INITIATOR, handshake => {
                    handshake.Initialize(null, this.clientStaticKeyPair.priv, null, base64js.toByteArray(bogusPsk))
                })
                noiseSession.start()

                const peerDisconnected = new DeferredPromise()
                const messenger = new PeerMessenger(cc, noiseSession, pairingInfo.peerId, {keepAliveInterval: 500})
                messenger.on("peerDisconnect", () => {
                    peerDisconnected.resolve()
                })

                const pairingFailedPromise = pairingPromise.then(
                    () => {
                        Promise.reject(new Error('Expected method to reject.'))
                    },
                    err => {
                        assert.instanceOf(err, Error)
                        assert.equal(err.message, "NOISE_ERROR_MAC_FAILURE")
                    }
                )
                

                return wait(10000, Promise.all([pairingFailedPromise, peerDisconnected.promise]))
            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });
});


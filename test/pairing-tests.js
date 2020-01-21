const assert = require('chai').assert
const base64js = require('base64-js')
const { NoiseSession, ChatClient, pairDevice, getNoiseLib } = require('../lib')
const { DeferredPromise } = require('../lib/util')
const startMockChatServer = require('./mock-chat-server')



const chatServerPort = 8085

describe('Pairing', function() {
        
    before(async function() {
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

    after(function(done) {
        this.chatServer.close(done)
    })

    describe('#pairDevice()', function() {
        it('Should return device on successful pairing', async function() {
            try {
                const serverAddr = `ws://localhost:${chatServerPort}`

                // start pairing
                const pairingInfoPromise = new DeferredPromise()
                let pairingPromise = pairDevice(serverAddr, this.serverStaticKeyPair, (pairingInfo) => {
                    pairingInfoPromise.resolve(pairingInfo)
                })
                const pairingInfo = await pairingInfoPromise.promise
                assert.typeOf(pairingInfo.peerId, 'string')
                assert.typeOf(pairingInfo.secret, 'string')
                assert.instanceOf(pairingInfo.url, URL)
                assert.equal(pairingInfo.url.protocol, 'secrets:')
                assert.equal(pairingInfo.url.searchParams.get('pairing-secret'), pairingInfo.secret)
                assert.equal(pairingInfo.url.searchParams.get('requester-id'), pairingInfo.peerId)
                
                // connect a client
                const cc = await new ChatClient(serverAddr).connected()
                // setup client noise session
                const noiseSession = new NoiseSession(this.noise, "NoisePSK_XX_25519_ChaChaPoly_SHA256", this.noise.constants.NOISE_ROLE_INITIATOR, handshake => {
                    handshake.Initialize(null, this.clientStaticKeyPair.priv, null, base64js.toByteArray(pairingInfo.secret))
                })
                noiseSession.start()

                noiseSession.bindToChatClient(cc, pairingInfo.peerId)

                await noiseSession.whenEstablished()

                return pairingPromise.then(device => {
                    assert.isNotNull(device)
                })
            } catch (error) {
                console.error(error)
                throw error 
            }
        });
    });
});

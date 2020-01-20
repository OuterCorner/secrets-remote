const assert = require('chai').assert
const { pairDevice, getNoiseLib } = require('../lib')
const startMockChatServer = require('./mock-chat-server')

const chatServerPort = 8085

describe('Pairing', function() {
        
    before(async function() {
        this.chatServer = startMockChatServer(chatServerPort)
        const noise = await getNoiseLib()
        const keys = noise.CreateKeyPair(noise.constants.NOISE_DH_CURVE25519)
        this.serverStaticKeyPair = {
            pub: keys[1],
            priv: keys[0]
        }
    })

    after(function(done) {
        this.chatServer.close(done)
    })

    describe('#pairDevice()', function() {
        it('Should return device on successful pairing', function(done) {
            try {
                pairDevice(`ws://localhost:${chatServerPort}`, this.serverStaticKeyPair, (pairingInfo) => {
                assert.typeOf(pairingInfo.peerId, 'string')
                assert.typeOf(pairingInfo.secret, 'string')
                assert.instanceOf(pairingInfo.url, URL)
                assert.equal(pairingInfo.url.protocol, 'secrets:')
                assert.equal(pairingInfo.url.searchParams.get('pairing-secret'), pairingInfo.secret)
                assert.equal(pairingInfo.url.searchParams.get('requester-id'), pairingInfo.peerId)
            }).then(device => {
                assert.isNotNull(device)
                done()
            })
            } catch (error) {
                console.error(error)    
            }
        });
    });
});

const assert = require('chai').assert
const { pairDevice } = require('../lib')
const startMockChatServer = require('./mock-chat-server')

describe('Pairing', function() {
    var chatServer = undefined
    const chatServerPort = 8085
    before(function(done) {
        chatServer = startMockChatServer(chatServerPort)
        done()
    })

    after(function(done) {
        chatServer.close(done)
    })

    describe('#pairDevice()', function() {
        it('Should return device on successful pairing', function(done) {
            
            pairDevice(`ws://localhost:${chatServerPort}`, (pairingInfo) => {
                assert.typeOf(pairingInfo.url, 'string')
            })
            .then(device => {
                assert.isNotNull(device)
                done()
            })
        });
    });
});

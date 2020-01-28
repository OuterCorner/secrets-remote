const assert = require('chai').assert
const { ChatClient, PeerMessenger } = require('../lib')
const { promiseTimeout, DeferredPromise } = require('../lib/util')
const startMockChatServer = require('./mock-chat-server')

const chatServerPort = 8086

describe('Peer messaging', function () {

    before(async function () {
        this.chatServer = startMockChatServer(chatServerPort)
    })

    after(function (done) {
        this.chatServer.close(done)
    })

    describe('connection', function () {
        it('Should detect peer is disconnected', async function () {
            try {
                const serverAddr = `ws://localhost:${chatServerPort}`

                // connect a clients
                const cc1 = await new ChatClient(serverAddr).connected()
                const cc2 = await new ChatClient(serverAddr).connected()

                const messenger1 = new PeerMessenger(cc1)
                const messenger2 = new PeerMessenger(cc2)

                const peer1Id = await cc1.request({ type: "hello" }).then(rsp => rsp.peerId)
                const peer2Id = await cc2.request({ type: "hello" }).then(rsp => rsp.peerId)

                messenger1.peerId = peer2Id
                messenger2.peerId = peer1Id
                
                messenger1.keepAliveInterval = 500 // 0.5 seconds

                const client2Disconnected = new DeferredPromise()
                messenger1.on("peerDisconnect", () => client2Disconnected.resolve())

                // disconnect client 2
                cc2.disconnect()

                // client 1 should detect that peer as droped off in a reasonable ammount of time (< 2 seconds)
                return promiseTimeout(2000, client2Disconnected.promise)

            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });
});


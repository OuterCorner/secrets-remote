const assert = require('chai').assert
const { ChatClient, PeerMessenger } = require('../lib')
const { wait, DeferredPromise } = require('../lib/util')
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
                const cc1 = await new ChatClient(serverAddr).connected
                const cc2 = await new ChatClient(serverAddr).connected

                const messenger1 = new PeerMessenger(cc1, undefined, undefined, {keepAliveInterval: 500})
                const messenger2 = new PeerMessenger(cc2, undefined, undefined, {keepAliveInterval: 500})

                const peer1Id = await cc1.request({ type: "hello" }).then(rsp => rsp.peer_id)
                const peer2Id = await cc2.request({ type: "hello" }).then(rsp => rsp.peer_id)

                messenger1.peerId = peer2Id
                messenger2.peerId = peer1Id
                

                const client2Disconnected = new DeferredPromise()
                messenger1.on("peerDisconnect", () => client2Disconnected.resolve())

                // disconnect client 2
                cc2.disconnect()
                await cc2.disconnected

                // client 1 should detect that peer as droped off in a reasonable ammount of time (< 5 seconds)
                return wait(5000, client2Disconnected.promise)

            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });
});


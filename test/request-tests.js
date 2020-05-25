const assert = require('chai').assert
const base64js = require('base64-js')
const pushService = require('superagent');
const mockPushService = require('superagent-mocker')(pushService);
const startMockChatServer = require('./mock-chat-server')
const { requestSecret, NoiseSession, ChatClient, PeerMessenger, PushNotificationService, getNoiseLib } = require('../lib')
const { wait } = require('../lib/util')
const { expectation } = require('./test-utils')




const chatServerPort = 8085

describe('Requesting secrets', function () {

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

    describe('#requestSecret()', function () {
        it('Should succesfully return an item', async function () {
            this.timeout(10000)
            try {
                const serverAddr = `ws://localhost:${chatServerPort}`

                const mockDevices = [
                    {
                        name: "Mocha Test",
                        apnsToken: "bogusSuccessToken",
                        publicKey: base64js.fromByteArray(this.clientStaticKeyPair.pub)
                    },
                    {
                        name: "Stale device",
                        apnsToken: "bogusFailingToken",
                        publicKey: "mFsKHijQ18LTyTlXUfk9uEqwcwD+07dwn3rLoQDKaWI="
                    }
                ]
                const mockQuery = { searchString: "survs", url: new URL("https://survs.com/app"), item: { types: ["login"], attributes: ["username", "password"] } }

                var peerId = undefined
                const pushRequestExpectation = expectation((request) => {
                    assert.equal(request.body.devices.length, 2)
                    peerId = request.body.payload.peer_id
                    assert.exists(peerId)
                    assert.equal(request.body.payload.public_key, base64js.fromByteArray(this.serverStaticKeyPair.pub))
                })
                mockPushService.post("/push", (req) => {
                    pushRequestExpectation.fulfill(req)
                    return {
                        body: {
                            "push_id": "7b7b3699-d4b6-42cf-a407-bbe8756f459f",
                            "results": {
                                "bogusSuccessToken": {
                                    "DeliveryStatus": "SUCCESSFUL",
                                    "StatusCode": 200,
                                    "StatusMessage": ""
                                },
                                "bogusFailingToken": {
                                    "DeliveryStatus": "PERMANENT_FAILURE",
                                    "StatusCode": 410,
                                    "StatusMessage": "{\"errorMessage\":\"Unregistered or expired token\",\"channelType\":\"APNS_SANDBOX\",\"pushProviderStatusCode\":\"400\",\"pushProviderError\":\"BadDeviceToken\",\"pushProviderResponse\":\"{\\\"reason\\\":\\\"BadDeviceToken\\\"}\"}"
                                }
                            }
                        }
                    }
                })
                
                const pushDelRequestExpectation = expectation((request) => {
                    // assert all devices are notified
                    assert.equal(request.body.devices.count, 1)
                    assert.equal(request.body.devices[0].token, mockDevices[0].apnsToken)
                })

                mockPushService.del("/push", (req) => {
                    pushDelRequestExpectation.fulfill(req)
                    return {
                        body: {
                            "results": {
                                "bogusSuccessToken": {
                                    "DeliveryStatus": "SUCCESSFUL",
                                    "StatusCode": 200,
                                    "StatusMessage": ""
                                }
                            }
                        }
                    }
                })

                const successFullPushNotification = expectation((device) => {
                    assert.equal(device.name, "Mocha Test")
                })
                const failedPushNotification = expectation((device) => {
                    assert.equal(device.name, "Stale device")
                })

                const notificationService = new PushNotificationService(pushService)
                notificationService.once("pushed", (device) => {
                    successFullPushNotification.fulfill(device)
                })
                notificationService.once("error", (error) => {
                    failedPushNotification.fulfill(error.device)
                })


                const resultPromise = requestSecret(serverAddr, this.serverStaticKeyPair, notificationService, mockDevices, mockQuery)
                await wait(500, Promise.all([pushRequestExpectation, successFullPushNotification, failedPushNotification]))

                // connect a client
                const cc = await new ChatClient(serverAddr).connected
                const peerMessenger = new PeerMessenger(cc, undefined, peerId)
                
                // send hello
                peerMessenger.sendSetupMessage({
                        "message_id": 1,
                        "type": "hello", 
                        "role": "request",
                        "public_key": base64js.fromByteArray(this.clientStaticKeyPair.pub)
                    })

                await wait(50, pushRequestExpectation) // should already be resolved

                await peerMessenger.onceSetupMessageReceived({type: "hello", role: "response" })

                // start noise session
                const noiseSession = new NoiseSession(this.noise, "Noise_KK_25519_ChaChaPoly_SHA256", this.noise.constants.NOISE_ROLE_INITIATOR, handshake => {
                    handshake.Initialize(null, this.clientStaticKeyPair.priv, this.serverStaticKeyPair.pub, null)
                })
                noiseSession.start()
                peerMessenger.noiseSession = noiseSession
                
                
                const request = await noiseSession.onceMessageReceived({type: "query", role: "request"})

                assert.equal(request.searchString, mockQuery.searchString)
                assert.equal(request.url, mockQuery.url)
                assert.deepEqual(request.item, mockQuery.item)

                noiseSession.sendMessage({
                    "type": "query",
                    "role": "response",
                    "message_id": request.message_id,
                    "item": {
                        "username": "John Doe",
                        "password": "123456"
                    }
                })

                return resultPromise.then(item => {
                    assert.equal(item.username, "John Doe")
                    assert.equal(item.password, "123456")
                })
            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });
});


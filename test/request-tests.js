const assert = require('chai').assert
const base64js = require('base64-js')
const fetchMock = require('fetch-mock').sandbox()
const mockPushService = require('fetch-absolute')(fetchMock)('https://push.example.com')
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
                        publicKey: base64js.fromByteArray(this.clientStaticKeyPair.pub),
                        channel: {
                            type: 'apns',
                            token: 'bogusSuccessToken',
                            appId: 'com.outercorner.ios.Secrets',
                            environment: 'dev'
                        }
                    },
                    {
                        name: "Stale device",
                        publicKey: "mFsKHijQ18LTyTlXUfk9uEqwcwD+07dwn3rLoQDKaWI=",
                        channel: {
                            type: 'apns',
                            token: 'bogusFailingToken',
                            appId: 'com.outercorner.ios.Secrets',
                            environment: 'dev'
                        }
                    }
                ]
                const mockQuery = { searchString: "survs", url: new URL("https://survs.com/app"), item: { types: ["login"], attributes: ["username", "password"] } }

                var peerId = undefined
                const pushRequestExpectation = expectation((reqOpts) => {
                    const requestBody = JSON.parse(reqOpts.body)
                    assert.equal(requestBody.devices.length, 2)
                    peerId = requestBody.payload.peer_id
                    assert.exists(peerId)
                    assert.equal(requestBody.payload.public_key, base64js.fromByteArray(this.serverStaticKeyPair.pub))
                })

                fetchMock.post("path:/push", (url, reqOpts) => {
                    pushRequestExpectation.fulfill(reqOpts)
                    return {
                        body: {
                            "push_id": "7b7b3699-d4b6-42cf-a407-bbe8756f459f",
                            "results": {
                                "bogusSuccessToken": "SUCCESSFUL",
                                "bogusFailingToken": "PERMANENT_FAILURE",
                            }
                        }
                    }
                })

                const pushDelRequestExpectation = expectation((reqOpts) => {
                    const requestBody = JSON.parse(reqOpts.body)
                    // assert all devices are notified
                    assert.equal(requestBody.devices.length, 1)
                    assert.equal(requestBody.devices[0].token, mockDevices[0].channel.token)
                })

                fetchMock.delete("path:/push", (url, reqOpts) => {
                    pushDelRequestExpectation.fulfill(reqOpts)
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

                const notificationService = new PushNotificationService(mockPushService)
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

                return resultPromise.then(result => {
                    assert.equal(result.secret.username, "John Doe")
                    assert.equal(result.secret.password, "123456")
                })
            } catch (error) {
                console.error(error)
                throw error
            }
        });
    });
});


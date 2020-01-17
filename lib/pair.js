const { once, EventEmitter } = require('events')
const { ChatClient } = require('./chat')
const secureRandom = require('secure-random')

exports.pairDevice = async function (callback) {

    // connect
    const cc = await new ChatClient('wss://chat.outercorner.com/v1/').connected()

    // say hello to get back our peerId
    const myId = await cc.request({ type: "hello" }).then(rsp => rsp.peerId)

    // generate a random value for this pairing
    const randomBytes = secureRandom(16)
    const randomString = toHexString(randomBytes)

    callback({
        peerId: myId,
        secret: randomString,
        url: `secrets://rsr/pair?requestor-id=${encodeURIComponent(myId)}&pairing-secret=${encodeURIComponent(randomString)}&channel=chatws`
    })
    return randomString
}




// bytes is an typed array (Int8Array or Uint8Array)
function toHexString(bytes) {
    function byteToHex(byte) {
        // convert the possibly signed byte (-128 to 127) to an unsigned byte (0 to 255).
        // if you know, that you only deal with unsigned bytes (Uint8Array), you can omit this line
        const unsignedByte = byte & 0xff;

        // If the number can be represented with only 4 bits (0-15), 
        // the hexadecimal representation of this number is only one char (0-9, a-f). 
        if (unsignedByte < 16) {
            return '0' + unsignedByte.toString(16);
        } else {
            return unsignedByte.toString(16);
        }
    }
    // Since the .map() method is not available for typed arrays, 
    // we will convert the typed array to an array using Array.from().
    return Array.from(bytes)
        .map(byte => byteToHex(byte))
        .join('');
}
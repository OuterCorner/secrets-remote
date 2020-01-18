const { getNoiseLib } = require('../lib')
const os = require('os')
const path = require('path')
const base64js = require('base64-js')
const store = require('data-store')({home: path.join(os.homedir(),'.outercorner'), name: "secrets-remote"})


async function getStaticKeyPair(){
    function convert(keyPair, mappingFunction){
        return Object.fromEntries(
            Object.entries(keyPair).map(([key, value]) => [key, mappingFunction(value)])
          )
    }
    let keyPair = store.get('staticKeyPair')
    if (!keyPair) {
        const noise = await getNoiseLib()
        const noiseKeyPair = noise.CreateKeyPair(noise.constants.NOISE_DH_CURVE25519)
        keyPair = {
            pub: noiseKeyPair[1],
            priv: noiseKeyPair[0]
        }
        store.set('staticKeyPair', convert(keyPair, base64js.fromByteArray))
    }
    else {
        keyPair = convert(keyPair, base64js.toByteArray)
    }
    return keyPair
}

module.exports = { getStaticKeyPair, store }
const os = require('os')
const path = require('path')
const base64js = require('base64-js')
const store = require('data-store')({home: path.join(os.homedir(),'.outercorner'), name: "secrets-remote"})
const chalk = require("chalk");
const chalkTable = require("chalk-table");
const _ = require('lodash')
const { getNoiseLib } = require('../lib')

const defaultChatServerAddr = 'wss://chat.outercorner.com/v1/'

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

function tabularDeviceData(origDevices, numbered = false, highlightedDevice) {
    let devices = _.cloneDeep(origDevices)
    let options = {
        leftPad: 2,
        columns: [
          { field: "name",  name: chalk.white("Name") },
          { field: "publicKey", name: chalk.white("Public Key") }
        ]
    }
    if (numbered) {
        options.columns.unshift({ field: "index",  name: chalk.gray("#") })
        devices.forEach((device, idx) => {device.index = idx + 1; return device })
    }

    if(highlightedDevice) {
        const idx = origDevices.findIndex((device) => device == highlightedDevice)
        if (idx >= 0) {
            let featured = devices[idx]
            Object.keys(featured).forEach(key => featured[key] = chalk.green(featured[key]))
        }
    }
    return chalkTable(options, devices)
}

module.exports = { getStaticKeyPair, store, tabularDeviceData,  defaultChatServerAddr}
#!/usr/bin/env node
const program = require('commander')
const chalk = require('chalk')
const { requestSecret, PushNotificationService } = require('../lib')
const { getStaticKeyPair, store } = require('./cli-common')
const pushService = require('superagent-use')(require('superagent'))
const superagent_prefix = require('superagent-prefix')
pushService.use(superagent_prefix('https://api.outercorner.com/secrets'))
const validTypes = ['login','creditcard','bankaccount','note','softwarelicense']


program
    .name("secrets request")
    .usage("<search> [options]")

// request command
program
    .arguments('<search> [options]')
    .option('-u, --url <url>', 'url of associated service', (url) => new URL(url))
    .option('-t, --type <type>', `type of item [${validTypes.join('|')}]`, parseType, {type: 'login'})
    .option('-d, --device <device>', 'name or index of device to query (all devices are queried by default)', parseDevice)
    .description("Remotely request a secret from a paired device")
    .action( function(searchString) {
        const devices = this.device || store.get('devices') || []
        if (devices.length == 0) {
            throw new Error("No paired devices.")
        }
        request(searchString, this.url, this.type, devices)
    })

program.parse(process.argv)

function parseType(typeArg, targetItems) {
    const components = typeArg.split(':')
    const type = components[0]
    
    if (!validTypes.includes(type.toLowerCase())) {
        throw new Error(`"${type}" is not one of the expected types: ${validTypes.join(',')}`)
    }
    
    let properties = []
    if (components.length > 1) {
        properties = components[1].split(',')
    }

    let types = [type]
    if (targetItems && targetItems.types) {
        types = targetItems.types.concat(types)
    }
    if (targetItems && targetItems.properties) {
        properties = targetItems.properties.concat(properties)
    }

    return {types, properties}
}

function parseDevice(deviceArg, selectedDevices = []) {
    var devices = store.get('devices') || []
    var device = undefined
    devices.forEach(d => {
        if (d.name == deviceArg) {
            device = d
        }
    });
    if (!device) {
        const index = parseInt(deviceArg)
        if (!isNaN(index) && (index >= 0 && index < devices.length)) {
            device = devices[index]
        }
    }
    if (!device) {
        throw new Error(`Could not find the requested device: ${deviceArg}`)
    }

    selectedDevices.push(device)
    return selectedDevices
}


async function request(searchString, url, item, devices) {
    try {
        const staticKeyPair = await getStaticKeyPair()

        const query = { searchString, url, item }
        const pns = new PushNotificationService(pushService)
        pns.on("pushed", (device) => {
            console.error(chalk.green('✓') + ` Notified device "${device.name}".`)
        })
        pns.on("error", (error) => {
            console.error(chalk.red("✕") + ` Failed to notify device "${error.device.name}": ${error}`)
        })

        const { secret } = await requestSecret('wss://chat.outercorner.com/v1/', staticKeyPair, pns, devices, query)
        
        console.log(JSON.stringify(secret))

    } catch(e) {
        console.log(chalk.red(e.stack))
        process.exit(1)
    }
    process.exit(0)
}
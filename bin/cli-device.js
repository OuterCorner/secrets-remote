#!/usr/bin/env node
const clear = require('clear');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const program = require('commander');
const inquirer = require('inquirer');
const { pairDevice } = require('../lib')
const { getStaticKeyPair, store, tabularDeviceData } = require('./cli-common')


program.name("secrets device")

// error on unknown commands
program.on('command:*', function () {
    console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
})

// pair command
program
    .command('pair')
    .option('-Q, --large-qrcode', 'use a large QR Code', false)
    .option('-y, --accept-name', 'automatically accept suggested device name')
    .description("pair a new device")
    .action( function(cmdObj) {
        pair(!cmdObj.largeQrcode, cmdObj.acceptName)
    })

// list command
program
    .command('list')
    .description("list paired devices")
    .action( list )

// list command
program
    .command('delete <id>')
    .option('-y, --accept-deletion', 'automatically accept deletion of device')
    .description("delete a paired device")
    .action( function(deviceId) {
        del(parseInt(deviceId), this.acceptDeletion)
    })

program.parse(process.argv)



async function pair(smallQR, autoAcceptName) {
    try {
        const staticKeyPair = await getStaticKeyPair()
        const device = await pairDevice('wss://chat.outercorner.com/v1/', staticKeyPair, (pairingInfo) => {
            const pairingUrl = pairingInfo.url
            clear()
            qrcode.generate(pairingUrl, {small: smallQR});
        })
    
        // const device = {name: "Remote App", apnsToken: "740f4707bebcf74f9b7c25d48e3358945f6aa01da5ddb38746safafafafa", publicKey: "mFsKHijQ18LTyTlXUfk9uEqwcwD+07dwn3rLoQDKaWI="}
        console.log(chalk.green('√') + " Pairing successful!")

        let deviceName = device.name
        if (!autoAcceptName) {
            deviceName = await inquirer.prompt([{ 
                name: 'deviceName', 
                message: `Enter a name for this device [${device.name}]:`,
                default: device.name
            }]).then(answers => answers.deviceName)
        }
        device.name = deviceName

        let devices = store.get('devices') || []
        devices.push(device)
        store.set('devices', devices)
        console.log(tabularDeviceData(devices, true, device))

    } catch(e) {
        console.log(chalk.red(e.stack))
        process.exit(1)
    }
    process.exit(0)
}

function list() {
    const devices = store.get('devices') || []    
    console.log(tabularDeviceData(devices, true))
}

async function del(index, autoAccept = false) {
    let devices = store.get('devices') || []
    
    if (isNaN(index) || (index < 0 || index >= devices.length)) {
        console.error(chalk.red(`ID ${index} is not valid`))
        process.exit(1)
    }
    const device = devices[index]

    if (!autoAccept) {
        const proceed = await inquirer.prompt([{ 
            message: `Are you sure you want to delete "${device.name}"?`,
            type: 'confirm',
            default: true,
            name: 'proceed'
        }]).then(answers => answers.proceed)
        if (!proceed) {
            process.exit(0)
        }
    }

    devices.splice(index, 1)
    store.set('devices', devices)
    console.log(chalk.green('√') + ` Device "${device.name}" deleted!`)
}
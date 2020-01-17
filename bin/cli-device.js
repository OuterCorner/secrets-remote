#!/usr/bin/env node
const { pairDevice } = require('../lib')
const clear = require('clear');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');

const program = require('commander');

program.name("secrets device")

// error on unknown commands
program.on('command:*', function () {
    console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
})

// list command
program
    .command('list')
    .description("list paired devices")
    .action( function() {
        console.log("listamos")
    })

// pair command
program
    .command('pair')
    .description("pair a new device")
    .action( pair )

clear()
program.parse(process.argv)


async function pair() {
    try {
        
        const device = await pairDevice((pairingInfo) => {
            const pairingUrl = pairingInfo.url
            qrcode.generate(pairingUrl, {small: true});
        })
    
    } catch(e) {
        console.log(chalk.red(e.stack))
        process.exit(1)
    }
    process.exit(0)
}
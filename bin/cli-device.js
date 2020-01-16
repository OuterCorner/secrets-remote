#!/usr/bin/env node
const { pairDevice } = require('../lib')

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
    .action( pairDevice )

program.parse(process.argv)
#!/usr/bin/env node

const program = require('commander');
const packageJson = require('../package.json');

program
    .version(packageJson.version)
    .name("secrets")
    .usage('[global options] <command>')
    .command('device <cmd>', "manage paired devices")
    .command('request', "request a secret from one or more devices")

program.parse(process.argv)


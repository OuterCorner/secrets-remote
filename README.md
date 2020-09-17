# secrets-remote

Command line tool to request secrets (logins, credit cards, notes…) from iOS devices running [Secrets 3.4.0+](https://outercorner.com/secrets-ios/).

Connections between this tool and the device are end-to-end encrypted.

## Installation

Via NPM:

```
npm install @outercorner/secrets-remote -g
```

## Usage

Before being able to retrieve secrets from your device you must pair with it first. Pairing will exchange the keys necessary to encrypt all your requests and is done by reading a QR Code.

To that extent, the ```secrets``` command provides two subcommands: ```device``` and ```request```.

The ```device``` subcommand manages paired devices, including adding and removing devices. The ```request``` command performs actual requests to your paired devices.


### Pair a device

To pair a device run:

```
secrets device pair
```

This will display a QR code in your terminal which you should scan using your device's camera. 

Use ```secrets device --help``` to lear how to manage your paired devices.

### Requesting secrets

The simplest form to request a secret is:

```secrets request github```

This simply requests a secret for a given search string ("github") in this case.

But it can be much more specific.

```secrets request github -u https://github.com -t login:otp -d "Paulo's iPhone"```

The above command specifically requests the one-time password for the github login and from the "Paulo's iPhone" device. Passing the `-u` option allows Secret to validate that the item return is in fact associated with that URL.


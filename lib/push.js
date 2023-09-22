const { EventEmitter } = require('events')
const { URLSearchParams } = require('url')

class PushNotificationService extends EventEmitter {

    constructor(pushService) {
        super()
        this.pushService = pushService
    }

    async notifyDevices(devices, payload) {

        // group devices by appId
        var devicesByAppId = filterAndGroupDevicesByAppId(devices)

        var pushRequests = []
        var notifiedDevices = []
        Object.entries(devicesByAppId).forEach(([appId, devicesForAppId]) => {
            let req = this.pushService('/push?' + new URLSearchParams({ appId }), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    devices: devicesForAppId.map(d => ({ token: d.channel.token, channel: pushChannelForDevice(d) })),
                    payload
                }),
            })
                .then((response) => response.json())
                .then((response) => {
                    const pushId = response.push_id

                    Object.entries(response.results).forEach(([deviceToken, result]) => {
                        if (result == 'SUCCESSFUL') {
                            var notifiedDevice = devices.find(d => d.channel.token == deviceToken)
                            notifiedDevice.pushId = pushId
                            notifiedDevices.push(notifiedDevice)
                            this.emit("pushed", notifiedDevice)
                        }
                        else {
                            const failedDevice = devices.find(d => d.channel.token == deviceToken)
                            const errorMessage = `Failed to deliver to device ${failedDevice.name}: ${result}`
                            var error = new Error(errorMessage)
                            error.device = failedDevice
                            this.emit("error", error)
                        }
                    })
                })

            pushRequests.push(req)
        });

        await Promise.all(pushRequests)

        if (notifiedDevices.length == 0) {
            throw new Error("Failed to notify a single device… You may want to clean up your device list and pair again.")
        }

        return notifiedDevices
    }

    retractNotification(devices) {
        // group devices by appId
        const devicesByAppId = filterAndGroupDevicesByAppId(devices)

        Object.entries(devicesByAppId).forEach(([appId, devicesForAppId]) => {
            const devicesByPushId = groupDevicesByPushId(devicesForAppId)

            Object.entries(devicesByPushId).forEach(([pushId, devicesForPushId]) => {
                this.pushService('/push?' + new URLSearchParams({ appId }), {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        "devices": devicesForPushId.map(d => ({ token: d.channel.token, channel: pushChannelForDevice(d) })),
                        "push_id": pushId
                    }),
                })
                .then(response => {
                    if (response.status != 200) {
                        console.debug(`Retracting notifications returned: ${response.status}`)
                    }
                })
            })
        })
    }



}

module.exports = { PushNotificationService }


function filterAndGroupDevicesByAppId(devices) {
    const reducer = (dict, device) => {
        if (device.channel == undefined || device.channel.type != "apns") {
            // we currently only support apns
            // so skip everything else
            return dict
        }
        const appId = device.channel.app_id;
        (dict[appId] = dict[appId] || []).push(device)
        return dict
    }
    return devices.reduce(reducer, {})
}

function groupDevicesByPushId(devices) {
    const reducer = (dict, device) => {
        const pushId = device.pushId;
        (dict[pushId] = dict[pushId] || []).push(device)
        return dict
    }
    return devices.reduce(reducer, {})
}

function pushChannelForDevice(device) {
    if (device.channel.type == "apns" && device.channel.environment == "dev") {
        return 'APNS_SANDBOX'
    }
    else if (device.channel.type == "apns" && device.channel.environment == "prod") {
        return 'APNS'
    }
}
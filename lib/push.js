const { EventEmitter } = require('events')

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
        Object.entries(devicesByAppId).forEach( ([appId,devicesForAppId]) => {
            let req = this.pushService
            .post('/push').query({ appId: appId })
            .send({
                devices: devicesForAppId.map(d => ({ token: d.channel.token, channel: pushChannelForDevice(d)})),
                payload
            })
            .set('Accept', 'application/json')
            .then((response) => {
                const pushId = response.body.push_id
                
                Object.entries(response.body.results).forEach(([deviceToken, result]) => {
                    if (result.StatusCode == 200) {
                        var notifiedDevice = devices.find(d => d.channel.token == deviceToken)
                        notifiedDevice.pushId = pushId
                        notifiedDevices.push(notifiedDevice)
                        this.emit("pushed", notifiedDevice)
                    }
                    else {
                        const failedDevice = devices.find(d => d.channel.token == deviceToken)
                        const statusMessage = JSON.parse(result.StatusMessage)
                        var error =  new Error(statusMessage.errorMessage)
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
        
        Object.entries(devicesByAppId).forEach( ([appId, devicesForAppId]) => {
            const devicesByPushId = groupDevicesByPushId(devicesForAppId)

            Object.entries(devicesByPushId).forEach( ([pushId, devicesForPushId]) => {
                this.pushService
                .delete('/push').query({ appId: appId })
                .send({
                    "devices": devicesForPushId.map(d => ({ token: d.channel.token, channel: pushChannelForDevice(d) })),
                    "push_id": pushId
                }).end()
            })
        })
    }


    
}

module.exports = { PushNotificationService }


function filterAndGroupDevicesByAppId(devices){
    const reducer = (dict, device) =>  {
        if (device.channel.type != "apns") {
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

function groupDevicesByPushId(devices){
    const reducer = (dict, device) =>  {
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
const { EventEmitter } = require('events')

const PUSH_CHANNEL = 'APNS_SANDBOX'

class PushNotificationService extends EventEmitter {

    constructor(pushService) {
        super()
        this.pushService = pushService
    }

    async notifyDevices(devices, payload) {
 
        // issue push to notify available devices of this request
        const response = await this.pushService
            .post('/push')
            .send({
                devices: devices.map(d => ({ token: d.apnsToken, channel:  PUSH_CHANNEL})),
                payload
            })
            .set('Accept', 'application/json')
        
        const pushId = response.body.push_id
        
        let notifiedDevices = []
        Object.entries(response.body.results).forEach(([deviceToken, result]) => {
            if (result.StatusCode == 200) {
                const notifiedDevice = devices.find(d => d.apnsToken == deviceToken)
                notifiedDevices.push(notifiedDevice)
                this.emit("pushed", notifiedDevice)
            }
            else {
                const failedDevice = devices.find(d => d.apnsToken == deviceToken)
                const statusMessage = JSON.parse(result.StatusMessage)
                var error =  new Error(statusMessage.errorMessage)
                error.device = failedDevice
                this.emit("error", error)
            }
        })
    
        if (notifiedDevices.length == 0) {
            throw new Error("Failed to notify a single device… You may want to clean up your device list and pair again.")
        }
    
        return { pushId, notifiedDevices }
    }

    retractNotification(pushId, devices) {    
        this.pushService.delete('/push').send({
            "devices": devices.map(d => ({ token: d.apnsToken, channel: PUSH_CHANNEL })),
            "push_id": pushId
        }).end()
    }
}

module.exports = { PushNotificationService }
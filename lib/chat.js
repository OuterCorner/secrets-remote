const { EventEmitter } = require('events')
const WebSocket = require('isomorphic-ws')
const async = require('async')
const { DeferredPromise } = require('./util')

class ChatClient extends EventEmitter {
    
    constructor(address) {
        super()
        this._connected = new DeferredPromise()
        this._disconnected = new DeferredPromise()
        this._messageId = 0
        this._serialRequestQueue = async.queue(function(task, callback) {
            task().finally(callback)
        }, 1);
        const ws = new WebSocket(address)
        const responseEmitter = new EventEmitter()
        ws.onopen = () => { 
            ws.onerror = undefined
            this._connected.resolve(this)
            this.emit("connected")
        }
        ws.onerror = error => { 
            this._connected.reject(error) 
            this.emit("error", error)
        }
        ws.onmessage = (payload) => {
            const msg = JSON.parse(payload.data)
            if (msg.role == 'response') {
                responseEmitter.emit(msg.message_id, msg)
            }
            else {
                this.emit(msg.type, msg)
            }
        }
        ws.onclose = () => {
            this.emit("disconnected")
        }

        this.responses = responseEmitter
        this._ws = ws
    }

    get connected() {
        return this._connected.promise
    }

    async request(msg) {
        const msgId = this._messageId++
        msg.message_id = msgId
        msg.role = 'request'

        return new Promise( (resolve, reject) => {
            this._serialRequestQueue.push( () => {
                let p = this.onceResponseReceived(msgId)
                    .then( responses => {
                        const response = responses.shift()
                        const statusCode  = response.result.status
                        if (statusCode >= 200 && statusCode < 300){
                            return response.result
                        } else {
                            throw new ChatError(statusCode, response.result.message)
                        }
                    })
                    .then( result => resolve(result))
                    .catch( error => reject(error))
                this._ws.send(JSON.stringify(msg))
                return p
            })
        })
    }

    get disconnected() {
        return this._disconnected.promise
    }

    disconnect(error) {
        if (!error) {
            this._serialRequestQueue.drain().then(() => {
                this._disconnected.resolve()
                this._ws.close()
            })
        } else {
            this._disconnected.resolve()
            this._ws.close()
        }
    }

    onceResponseReceived(name) {
        const emitter = this.responses
        return new Promise((resolve, reject) => {
            function eventListener() {
              if (errorListener !== undefined) {
                emitter.removeListener('error', errorListener);
              }
              resolve([].slice.call(arguments));
            };
            var errorListener;
        
            // Adding an error listener is not optional because
            // if an error is thrown on an event emitter we cannot
            // guarantee that the actual event we are waiting will
            // be fired. The result could be a silent way to create
            // memory or file descriptor leaks, which is something
            // we should avoid.
            if (name !== 'error') {
              errorListener = function errorListener(err) {
                emitter.removeListener(name, eventListener);
                reject(err);
              };
        
              emitter.once('error', errorListener);
            }
        
            emitter.once(name, eventListener);
          });
    }
}

class ChatError extends Error {
    constructor(status = 500, ...params) {
        super(...params)

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ChatError)
        }

        this.status = status
    }    
}

module.exports = { ChatClient, ChatError }
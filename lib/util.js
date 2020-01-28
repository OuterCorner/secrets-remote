const createNoise = require('noise-c.wasm');

async function getNoiseLib() {
    if (typeof getNoiseLib.lib == 'undefined') {
        return new Promise((resolve, reject) => {
            createNoise(function (lib) {
                getNoiseLib.lib = lib
                resolve(lib)
            })
        })
    }
    return getNoiseLib.lib
}

function promiseTimeout(ms, promise) {

    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id);
            reject(new Error('Timed out in ' + ms + 'ms.'))
        }, ms)
    })

    // Returns a race between our timeout and the passed in promise
    return Promise.race([
        promise,
        timeout
    ])
}

class DeferredPromise {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject
            this.resolve = resolve
        })
    }
}

module.exports = {
    getNoiseLib,
    promiseTimeout,
    DeferredPromise
}
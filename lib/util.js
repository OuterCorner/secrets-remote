const createNoise = require('noise-c.wasm');

async function getNoiseLib() {
    if( typeof getNoiseLib.lib == 'undefined' ) {
        return new Promise( (resolve, reject) => {
            createNoise(function(lib) {
                getNoiseLib.lib = lib
                resolve(lib)
            })
        })
    }
    return getNoiseLib.lib
}


class DeferredPromise {
    constructor() {
        this.promise = new Promise((resolve, reject)=> {
            this.reject = reject
            this.resolve = resolve
        })
    }
}

module.exports = {
    getNoiseLib,
    DeferredPromise
}
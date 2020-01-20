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

function mergeTypedArrays(a, b) {
    // Checks for truthy values on both arrays
    if(!a && !b) throw 'Please specify valid arguments for parameters a and b.';  

    // Checks for truthy values or empty arrays on each argument
    // to avoid the unnecessary construction of a new array and
    // the type comparison
    if(!b || b.length === 0) return a;
    if(!a || a.length === 0) return b;

    // Make sure that both typed arrays are of the same type
    if(Object.prototype.toString.call(a) !== Object.prototype.toString.call(b))
        throw 'The types of the two arguments passed for parameters a and b do not match.';

    var c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);

    return c;
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
    mergeTypedArrays,
    getNoiseLib,
    DeferredPromise
}
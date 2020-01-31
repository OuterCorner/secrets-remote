

function expectation(test) {
    var fulfill
    var p = new Promise( (resolve, reject) => {
        fulfill = resolve
    }).then ((result) => {
        test(result)
    })
    p.fulfill = fulfill
    return p    
}


module.exports = {
    expectation
}

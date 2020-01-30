const EventEmitter = require('events');
const Stream = require('stream');
const { TextDecoder, TextEncoder } = require('text-encoding')
const { DeferredPromise } = require('./util');

class NoiseSession extends EventEmitter {
	
	constructor(lib, protocol, role, initializeHandshake) {
		super()
		this._lib = lib
		this.protocol = protocol
		this.role = role
		this.handshakeState = lib.HandshakeState(protocol, role)

		initializeHandshake(this.handshakeState)
		this._state = NoiseSessionState.READY
		this._whenEstablished = new DeferredPromise()
		this._transportStream = undefined
		this._error = undefined
		this._inBuffer = undefined
		this._sendingCipherState = undefined
		this._receivingCipherState = undefined
		this._handshakeHash = undefined
		this._remotePublicKey = undefined
	}

	get state() { return this._state  }
	set state(newState) {
		this._state = newState
		this.emit("state", this._state)
		switch (newState) {
			case NoiseSessionState.ERROR:
				// it's ok if we reject an already resolved promise (nothing happens)
				this._whenEstablished.reject(this._error)
				// falltrough
			case NoiseSessionState.STOPPED:
				if (this._transportStream) {
					this._transportStream.destroy(this._error)
				}
				break
		}
	}

	get transportStream() {
		return this._transportStream
	}

	get handshakeHash() {
		return this._handshakeHash
	}

	get remotePublicKey() {
		return this._remotePublicKey
	}

	whenEstablished() {
		return this._whenEstablished.promise
	}

	start() {
		this._inBuffer = Buffer.alloc(0)
		this._transportStream = new Stream.Duplex()

		this._transportStream._read = (size) => {}
		this._transportStream._write = (chunk, encoding, done) => {
			let buffer = Buffer.concat([this._inBuffer, chunk])
			do {
				var payload = undefined
				if (buffer.length < 2) {
					// we don't even have enough to read the size header
					break
				}
				let size = (buffer[0] << 8) | buffer[1]
				if (buffer.length >= size + 2) {
					// we can read the entire message
					payload = buffer.subarray(2, 2+size)
					buffer = buffer.slice(2 + payload.length)
					this._receivedPayload(payload)
				} 
			} while(payload);

			this._inBuffer = buffer

			done()
		}

		this.state = NoiseSessionState.HANDSHAKING
		this._nextHandshakeAction()
	}

	get error(){
		return this._error
	}

	abort(error) {
		this._error = error
		this.state = NoiseSessionState.ERROR
	}

	sendMessage(message) {
		const jsonString = JSON.stringify(message)
		const plaintext = new TextEncoder("utf-8").encode(jsonString)
		
		this.whenEstablished().then(() => {
			const ciphertext = this._sendingCipherState.EncryptWithAd(new Uint8Array(), plaintext)
			this._sendPayload(ciphertext)
		})
	}

	_receivedPayload(payload) {
		try {
			if (this.state == NoiseSessionState.HANDSHAKING) {
				const action = this.handshakeState.GetAction()
				if (action != this._lib.constants.NOISE_ACTION_READ_MESSAGE) {
					this.abort(Error("Received unexpected data during handshake"))
					return
				}
				this.handshakeState.ReadMessage(payload)
				this._nextHandshakeAction()
			}
			else if (this.state == NoiseSessionState.ESTABLISHED) {
				const plaintext = this._receivingCipherState.DecryptWithAd(new Uint8Array(), payload)
				const jsonString = new TextDecoder("utf-8").decode(plaintext);
				const message = JSON.parse(jsonString)
				this.emit("message", message)
			}
		} catch(error) {
			this.abort(error)
		}
	}

	_sendPayload(payload) {
		let size = payload.length
		let sizeHeader = new Uint8Array(2)
		sizeHeader[0] = (size >> 8) & 0xFF
		sizeHeader[1] = (size >> 0) & 0xFF

		this.transportStream.push(sizeHeader)
		this.transportStream.push(payload)
	}


	_nextHandshakeAction() {
		if (this.state != NoiseSessionState.HANDSHAKING) { 
			return 
		}
		
		const action = this.handshakeState.GetAction()

		if (action != this._lib.constants.NOISE_ACTION_WRITE_MESSAGE &&
			action != this._lib.constants.NOISE_ACTION_SPLIT) {
			return
		}
		
		if (action == this._lib.constants.NOISE_ACTION_WRITE_MESSAGE) {
			const m = this.handshakeState.WriteMessage()
			this._sendPayload(m)
		}
		else if(action == this._lib.constants.NOISE_ACTION_SPLIT) {
			this._handshakeHash = this.handshakeState.GetHandshakeHash()
			this._remotePublicKey = this.handshakeState.GetRemotePublicKey()
			let [send, recv] = this.handshakeState.Split()
			this._sendingCipherState = send
			this._receivingCipherState = recv
			this.handshakeState = null
			this.state = NoiseSessionState.ESTABLISHED
			this._whenEstablished.resolve()
		}
		this._nextHandshakeAction()
	}
}

const NoiseSessionState = {
	READY: "ready",
	HANDSHAKING: "handshaking",
	ESTABLISHED: "established",
	STOPPED: "stopped",
	ERROR: "error",
};

module.exports = {
	NoiseSession
}

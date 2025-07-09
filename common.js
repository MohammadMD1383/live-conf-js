const {Buffer} = require("node:buffer");

const i = (function* () {
	let i = 1;
	while (true) {
		yield i++;
	}
})();
function iota() {
	return i.next().value;
}

const errors = {};

//@formatter:off
errors[errors["ERROR_UNKNOWN_COMMAND"  ] = iota()] = "ERROR_UNKNOWN_COMMAND"  ;
errors[errors["ERROR_BAD_COMMAND"      ] = iota()] = "ERROR_BAD_COMMAND"      ;
errors[errors["ERROR_KEY_NOT_FOUND"    ] = iota()] = "ERROR_KEY_NOT_FOUND"    ;
errors[errors["ERROR_SET_NOT_SUPPORTED"] = iota()] = "ERROR_SET_NOT_SUPPORTED";
errors[errors["ERROR_GET_NOT_SUPPORTED"] = iota()] = "ERROR_GET_NOT_SUPPORTED";
errors[errors["ERROR_IN_OPERATION"     ] = iota()] = "ERROR_IN_OPERATION"     ;
errors[errors["ERROR_TRIGGER_NOT_FOUND"] = iota()] = "ERROR_TRIGGER_NOT_FOUND";
errors[errors["ERROR_PARAMS_PARSE"     ] = iota()] = "ERROR_PARAMS_PARSE"     ;
//@formatter:on

function sendMessage(socket, payload) {
	const payloadBuffer = Buffer.from(payload, "utf8");
	const lengthBuffer = Buffer.alloc(4);
	lengthBuffer.writeUInt32BE(payloadBuffer.length, 0);
	socket.write(Buffer.concat([lengthBuffer, payloadBuffer]));
}

class MessageParser {
	constructor() {
		this.receiveBuffer = Buffer.alloc(0);
		this.expectedLength = null;
	}
	
	appendData(data) {
		this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
	}
	
	nextMessage() {
		if (this.expectedLength === null) {
			if (this.receiveBuffer.length >= 4) {
				this.expectedLength = this.receiveBuffer.readUInt32BE(0);
				this.receiveBuffer = this.receiveBuffer.subarray(4);
			} else {
				// Not enough data to read length
				return null;
			}
		}
		
		if (this.expectedLength !== null && this.receiveBuffer.length >= this.expectedLength) {
			const messageBuffer = this.receiveBuffer.subarray(0, this.expectedLength);
			this.receiveBuffer = this.receiveBuffer.subarray(this.expectedLength);
			this.expectedLength = null;
			return messageBuffer.toString("utf8");
		}
		// Not enough data for the full message
		return null;
	}
}

module.exports = {
	errors,
	sendMessage,
	MessageParser
};

const configs = new Map();
const triggerHandlers = new Map(); // To store trigger handlers
const {createServer} = require("node:net");
const fs = require("node:fs");
const {errors, sendMessage, MessageParser} = require("./common");
const {parseTriggerCommand} = require("./server-command-parser");

const server = createServer(socket => {
	const serverParser = new MessageParser();
	
	socket.on("data", data => {
		serverParser.appendData(data);
		let command;
		while ((command = serverParser.nextMessage()) !== null) {
			processCommand(socket, command);
		}
	});
});

function processCommand(socket, command) {
	switch (true) {
		case command.startsWith("GET "):
			processGET(socket, command.substring(4));
			break;
		case command.startsWith("SET "):
			processSET(socket, command.substring(4));
			break;
		case command.startsWith("TRIGGER "):
			processTRIGGER(socket, command.substring(8));
			break;
		default:
			sendMessage(socket, `ERROR ${errors.ERROR_UNKNOWN_COMMAND}`);
			break;
	}
}

const basePath = "/tmp/.live-conf";
const socketPath = `${basePath}/${process.pid}`;
const cleanupPaths = [socketPath];
fs.mkdirSync(basePath, {recursive: true});
server.listen(socketPath);

function alias(id) {
	const aliasPath = `${basePath}/${id}`;
	if (fs.existsSync(aliasPath)) {
		fs.unlinkSync(aliasPath);
	}
	fs.linkSync(socketPath, aliasPath);
	cleanupPaths.push(aliasPath);
}

function registerConfig(key, type, endpoint) {
	configs.set(key, {
		type,
		endpoint
	});
}

function on(triggerName, callback) {
	if (typeof triggerName !== "string" || !triggerName) {
		throw new Error("Trigger name must be a non-empty string.");
	}
	if (typeof callback !== "function") {
		throw new Error("Callback must be a function.");
	}
	triggerHandlers.set(triggerName, callback);
}

// SET key value
//     ^^^^^^^^^
function processSET(socket, command) {
	const [key, value, ...rest] = command.split(" ");
	if (rest.length) {
		sendMessage(socket, `ERROR ${errors.ERROR_BAD_COMMAND}`);
		return;
	}
	
	if (!configs.has(key)) {
		sendMessage(socket, `ERROR ${errors.ERROR_KEY_NOT_FOUND}`);
		return;
	}
	
	const setter = configs.get(key).endpoint.set;
	if (!setter) {
		sendMessage(socket, `ERROR ${errors.ERROR_SET_NOT_SUPPORTED}`);
		return;
	}
	
	try {
		setter(value);
		sendMessage(socket, "OK");
	} catch (e) {
		sendMessage(socket, `ERROR ${errors.ERROR_IN_OPERATION}`);
	}
}

function cleanup() {
	for (const path of cleanupPaths) {
		if (fs.existsSync(path)) {
			try {
				fs.unlinkSync(path);
			} catch (e) {
				// Ignore errors during cleanup, e.g. if file is already removed
				console.warn(`Warning: could not unlink ${path} during cleanup: ${e.message}`);
			}
		}
	}
}

function processGET(socket, command) {
	const [key, ...rest] = command.split(" ");
	if (rest.length) {
		sendMessage(socket, `ERROR ${errors.ERROR_BAD_COMMAND}`);
		return;
	}
	
	if (!configs.has(key)) {
		sendMessage(socket, `ERROR ${errors.ERROR_KEY_NOT_FOUND}`);
		return;
	}
	
	const getter = configs.get(key).endpoint.get;
	if (!getter) {
		sendMessage(socket, `ERROR ${errors.ERROR_GET_NOT_SUPPORTED}`);
		return;
	}
	
	try {
		const value = getter();
		sendMessage(socket, String(value)); // Ensure value is stringified
	} catch (e) {
		sendMessage(socket, `ERROR ${errors.ERROR_IN_OPERATION}`);
	}
}

// TRIGGER triggerName params...
//           ^^^^^^^^^^^^^^^^^^
// The `command` parameter is the string part *after* "TRIGGER "
function processTRIGGER(socket, command) {
	const { triggerName, paramsArray } = parseTriggerCommand(command);

	if (!triggerName) { // Should not happen if parseTriggerCommand is robust and command is not empty
		sendMessage(socket, `ERROR ${errors.ERROR_BAD_COMMAND}`); // Or a more specific error
		return;
	}
	
	if (!triggerHandlers.has(triggerName)) {
		sendMessage(socket, `ERROR ${errors.ERROR_TRIGGER_NOT_FOUND}`);
		return;
	}
	
	const handler = triggerHandlers.get(triggerName);
	
	// At this point, paramsArray contains strings as sent by the client.
	// The client's parseValue function already converted "true" to true (boolean) then String(true) to "true" (string) for sending.
	// So, here paramsArray will be like ["123", "true", "some string"].
	// The handler function should be prepared to receive these strings and parse them if needed,
	// or the contract is that they are already in a usable string form.
	// For example, if a handler expects a number, it should do Number(param).
	// This was the implicit behavior before as well, as split(',') also yielded strings.

	try {
		handler(...paramsArray); // Spread operator passes array elements as individual arguments
		sendMessage(socket, "OK");
	} catch (e) {
		console.error(`Error executing trigger "${triggerName}":`, e);
		sendMessage(socket, `ERROR ${errors.ERROR_IN_OPERATION}`);
	}
}

module.exports = {
	alias,
	registerConfig,
	on
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(0);
});

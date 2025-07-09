const configs = new Map();
const triggerHandlers = new Map(); // To store trigger handlers
const {createServer} = require("node:net");
const fs = require("node:fs");
const {errors, sendMessage, MessageParser} = require("./common");

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
function processTRIGGER(socket, command) { // TODO: move parsing logic to another file, keeping only business logic here
	const firstSpaceIndex = command.indexOf(" ");
	let triggerName;
	let paramsString = "";
	
	if (firstSpaceIndex === -1) {
		triggerName = command; // No params
	} else {
		triggerName = command.substring(0, firstSpaceIndex);
		paramsString = command.substring(firstSpaceIndex + 1);
	}
	
	if (!triggerHandlers.has(triggerName)) {
		sendMessage(socket, `ERROR ${errors.ERROR_TRIGGER_NOT_FOUND}`);
		return;
	}
	
	const handler = triggerHandlers.get(triggerName);
	let paramsArray = [];
	
	if (paramsString) {
		// This is a naive split by comma.
		// If params can contain commas and are quoted (e.g., "param1,still1",param2),
		// a more sophisticated CSV-like parser would be needed here.
		// For now, assuming params are simple or client `cli.js` pre-formats them
		// such that simple comma split is sufficient, or sends them in a way server expects.
		// The current cli.js sends the raw string from inside the parentheses.
		// "1,2,3" -> ["1","2","3"]
		// "\"hi\",test" -> ["\"hi\"","test"] (quotes become part of the param)
		// If cli.js were to send "hi,test" for one-param-trig("hi,test"), then this split is fine.
		// If cli.js sends `TRIGGER one-param-trig "hi,test"`, then paramsString is `"hi,test"`.
		// The current cli.js sends `TRIGGER one-param-trig hi,test` if input is `one-param-trig(hi,test)`
		// and `TRIGGER one-param-trig "hi"` if input is `one-param-trig("hi")`
		// So `paramsString` will be `hi,test` or `"hi"`.
		// We should aim to parse these into an array of strings.
		// A robust way is to parse CSV-like strings. For now, simple split:
		try {
			// Attempt to parse as if it's a JSON array if it looks like one,
			// otherwise split by comma. This is still a heuristic.
			// A better approach specified by the message format would be ideal.
			// Assuming parameters are comma-separated as per plan.
			// If a parameter is `\"quoted string\"`, it will be passed as is.
			paramsArray = paramsString.split(",").map(p => p.trim());
			// If paramsString was empty (e.g. trigger()), split will give [''], filter that out.
			if (paramsArray.length === 1 && paramsArray[0] === "") {
				paramsArray = [];
			}
		} catch (e) {
			sendMessage(socket, `ERROR ${errors.ERROR_PARAMS_PARSE}`);
			return;
		}
	}
	
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

const configs = new Map;
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

}

function processGET(command) {

}

function processTRIGGER(command) {

}

module.exports = {
	alias,
	registerConfig
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

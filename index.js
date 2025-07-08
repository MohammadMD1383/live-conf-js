const configs = new Map;
const {createServer} = require("node:net");
const fs = require("node:fs");
const {errors} = require("./common");

const server = createServer(socket => {
	socket.on("data", data => {
		const command = data.toString();
		switch (true) {
			case command.startsWith("GET "):
				processGET(socket, command.substring(4));
				break;
			case command.startsWith("SET "):
				processSET(socket, command.substring(4));
				break;
			case command.startsWith("TRIGGER "):
				processTRGGER(socket, command.substring(8));
				break;
			default:
				socket.write(`ERROR ${errors.ERROR_UNKNOWN_COMMAND}`);
				break;
		}
	});
});

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
		socket.write(`ERROR ${errors.ERROR_BAD_COMMAND}`);
		return;
	}
	
	if (!configs.has(key)) {
		socket.write(`ERROR ${errors.ERROR_KEY_NOT_FOUND}`);
		return;
	}
	
	const setter = configs.get(key).endpoint.set;
	if (!setter) {
		socket.write(`ERROR ${errors.ERROR_SET_NOT_SUPPORTED}`);
	}
	
	try {
		setter(value);
		socket.write("OK");
	} catch (e) {
		socket.write(`ERROR ${errors.ERROR_IN_OPERATION}`);
	}
}

function cleanup() {

}

function processGET(command) {

}

function processTRGGER(command) {

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

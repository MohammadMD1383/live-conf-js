const {program} = require("commander");
const fs = require("node:fs");
const net = require("node:net");
const {errors, sendMessage, MessageParser} = require("./common");
const {parseCliArguments} = require("./cli-parser"); // Assuming cli-parser.js is in the same directory

program.name("lc");
program.version(require("./package.json").version);

function socket(pid) {
	const path = `/tmp/.live-conf/${pid}`;
	if (!fs.existsSync(path)) {
		return false;
	}
	
	return net.createConnection(path);
}

program
	.argument("<pid>", "process id or its alias")
	.argument("<command>", "command to execute: get, set, trigger", (v) => {
		if (/^(get|set|trigger)$/.test(v)) {
			return v;
		}
		throw Error("invalid command");
	})
	.argument("<args...>", "arguments for the command")
	.action((pid, command, args) => {
		const s = socket(pid);
		if (!s) {
			console.error(`socket \`${pid}\` not found`);
			return;
		}
		
		const clientParser = new MessageParser();
		let payloadsSentCount = 0;

		s.once("connect", () => {
			try {
				const payloads = parseCliArguments(command, args);
				payloadsSentCount = payloads.length;

				if (payloadsSentCount === 0 && args.length > 0) {
					console.error("Error: No valid payloads generated for the given arguments.");
					s.end();
					process.exit(1);
					return;
				}

				if (payloadsSentCount === 0) {
				    s.end();
				    return;
				}

				for (const payload of payloads) {
					sendMessage(s, payload);
				}
			} catch (error) {
				console.error(`Error processing command: ${error.message}`);
				s.end();
				process.exit(1);
			}
		});
		
		let messagesReceived = 0;
		s.on("data", data => {
			clientParser.appendData(data);
			let response;
			while ((response = clientParser.nextMessage()) !== null) {
				messagesReceived++;
				response = response.replace(/ERROR (\d+)/, (s, ...matchedArgs) => {
					return errors[matchedArgs[0]] || `UNKNOWN_ERROR_CODE_${matchedArgs[0]}`;
				});
				console.log(response);
				if (payloadsSentCount > 0 && messagesReceived >= payloadsSentCount) {
					s.end();
				} else if (payloadsSentCount === 0 && args.length === 0) {
					// This case implies no args were given, and no payloads were generated.
					// Commander should prevent this if <args...> is truly required.
					// If it's reached, socket should already be closing or closed.
					s.end();
				}
			}
		});

		s.on("close", () => {
			// console.log("Connection closed.");
		});

		s.on("error", (err) => {
			console.error(`Socket error: ${err.message}`);
		});
	});

program.parse();

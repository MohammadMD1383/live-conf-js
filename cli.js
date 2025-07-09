const {program} = require("commander");
const fs = require("node:fs");
const net = require("node:net");
const {errors, sendMessage, MessageParser} = require("./common");
const {parseCliArguments} = require("./cli-parser");

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
		let payloadsSentCount = 0; // Will be determined in 'connect' handler

		s.once("connect", () => {
			try {
				const payloads = parseCliArguments(command, args);
				payloadsSentCount = payloads.length;

				// Note: Original TODOs in this block are now addressed by cli-parser.js
				if (payloadsSentCount === 0 && args.length > 0) {
					console.error("Error: No valid payloads generated for the given arguments.");
					s.end();
					process.exit(1);
					return;
				}

				// If args were required by commander but somehow parseCliArguments produced no payloads
				// (e.g. all inputs were invalid for TRIGGER),
				// and args.length > 0, we exit above.
				// If args.length === 0 (e.g. command that takes no args, though not current case),
				// and payloadsSentCount is 0, it's fine, just nothing to send. Connection will close.
				// If commander enforces <args...>, then args.length will always be > 0.
				// So, if payloadsSentCount is 0 here, it means an error or all args were filtered.

				if (payloadsSentCount === 0) { // Covers args.length === 0 or all args filtered
				    s.end(); // Nothing to send, close gracefully.
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
		// const expectedMessages = args.length; // This is not reliable anymore. Use payloadsSentCount.

		s.on("data", data => {
			clientParser.appendData(data);
			let response;
			while ((response = clientParser.nextMessage()) !== null) {
				messagesReceived++;
				response = response.replace(/ERROR (\d+)/, (s, ...matchedArgs) => {
					return errors[matchedArgs[0]] || `UNKNOWN_ERROR_CODE_${matchedArgs[0]}`;
				});
				console.log(response);
				// payloadsSentCount is determined in the 'connect' handler.
				// Ensure it's accessible here, or recalculate/pass it.
				// For simplicity, assuming payloadsSentCount is correctly set from the 'connect' scope
				// or that we can use the length of the originally parsed payloads.
				// Let's refine the closing logic.
				// The original logic was if (++c >= args.length) s.end();
				// This should be based on number of commands sent, which is payloads.length
				// This requires payloads to be accessible here or its length.
				// We'll use a closure variable for payloadsSentCount from the connect handler.

				if (payloadsSentCount > 0 && messagesReceived >= payloadsSentCount) {
					s.end();
				} else if (payloadsSentCount === 0 && args.length === 0) {
					// No args, no commands sent, connection should have been ended already or not made.
					// This path should ideally not be hit if connection ends earlier.
					s.end();
				}
			}
		});

		s.on("close", () => {
			// console.log("Connection closed.");
		});

		s.on("error", (err) => {
			console.error(`Socket error: ${err.message}`);
			// s.end(); // Socket might already be closed or will close.
		});
	});

program.parse();

const {program} = require("commander");
const fs = require("node:fs");
const net = require("node:net");
const {errors, sendMessage, MessageParser} = require("./common");

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

		s.once("connect", () => {
			const commandUpper = command.toUpperCase();
			if (commandUpper === "GET" || commandUpper === "SET") { // TODO: move command parsing to another file, not to mess up business logic
				for (const argString of args) {
					const [key, value] = argString.split("=");
					let payload = `${commandUpper} ${key}`;
					if (commandUpper === "SET") {
						if (value === undefined) {
							console.error(`error: missing value for set command for key "${key}"`);
							s.end();
							process.exit(1);
						}
						payload += ` ${value}`;
					} else if (value !== undefined) { // GET command with a value part
						console.warn(`warning: value for GET command for key "${key}" will be ignored`);
					}
					sendMessage(s, payload);
				}
			} else if (commandUpper === "TRIGGER") {
				// Regex to parse triggerName(param1,param2,...) or triggerName
				for (const argString of args) {
					const match = argString.match(/^([a-zA-Z0-9_.-]+)(?:\((.*)\))?$/);
					if (!match) {
						console.error(`error: invalid format for trigger argument: "${argString}"`);
						// We could choose to send an error to server or just skip this arg
						// For now, let's skip and print error. If all args fail, connection will close after 0 messages.
						continue;
					}
					const triggerName = match[1];
					let paramsString = match[2]; // This will be undefined if no parentheses, or could be empty string if event()

					// TODO: write a parser
					//       the parser must convert any value to its corresponding javascript type
					//       boolean, number, string, array, object
					//       this should also happen for SET command
					// Further parse paramsString: "p1,p2,\"p3,with,comma\",p4"
					// This simple split by comma is naive if params can contain commas.
					// For robust CSV-like parsing, a small parser or library would be better.
					// Given the spec "param1,param2,param3...", a simple split is the first step.
					// The client should quote params with commas if the server expects to parse them.
					// Or, the server receives the raw paramsString and parses it.
					// For now, let's send the raw paramsString (match[2]) or empty if undefined.

					let payload = `${commandUpper} ${triggerName}`;
					if (paramsString !== undefined) { // Only add space if there are params (even if empty string from "()")
						payload += ` ${paramsString}`;
					}
					sendMessage(s, payload);
				}
			}
		});
		
		let c = 0;
		s.on("data", data => {
			clientParser.appendData(data);
			let response;
			while ((response = clientParser.nextMessage()) !== null) {
				if (++c >= args.length) s.end();
				response = response.replace(/ERROR (\d+)/, (s, ...matchedArgs) => {
					return errors[matchedArgs[0]];
				});
				console.log(response);
			}
		});
	});

program.parse();

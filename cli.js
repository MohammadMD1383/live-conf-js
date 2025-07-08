const {program} = require("commander");
const fs = require("node:fs");
const net = require("node:net");
const {errors} = require("./common");

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
	.argument("<args...>", "syntax: key=value", (v, prev) => {
		const [key, value] = v.split("=");
		return [...prev ?? [], {key, value}];
	})
	.action((pid, command, args) => {
		const s = socket(pid);
		if (!s) {
			console.error(`socket \`${pid}\` not found`);
			return;
		}
		
		s.once("connect", () => {
			for (const arg of args) {
				s.write(`${command.toUpperCase()} ${arg.key} ${arg.value}`);
			}
		});
		
		let c = 0;
		s.on("data", data => {
			if (++c >= args.length) s.end();
			let response = data.toString();
			response = response.replace(/ERROR (\d+)/, (s, ...args) => {
				return errors[args[0]];
			});
			console.log(response);
		});
	});

program.parse();

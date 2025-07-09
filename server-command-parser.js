/**
 * Parses a string parameter received by the server into its likely JavaScript type.
 * - "true" / "false" (case insensitive) become boolean.
 * - Numeric strings become numbers.
 * - Strings that were quoted on the client (and quotes preserved for transport)
 *   will have their surrounding quotes removed.
 * @param {string} paramStr The string parameter to parse.
 * @returns {boolean | number | string} The parsed value.
 */
function parseServerValue(paramStr) {
	if (typeof paramStr !== "string") {
		return paramStr; // Should not happen if client sends strings
	}
	
	const lowerParamStr = paramStr.toLowerCase();
	if (lowerParamStr === "true") {
		return true;
	}
	if (lowerParamStr === "false") {
		return false;
	}
	
	// Check if it's a number (integer or float)
	// Ensure that the entire string is a valid representation of a number
	if (!isNaN(paramStr) && !isNaN(parseFloat(paramStr))) {
		const num = Number(paramStr);
		// Check if converting back to string matches the original trimmed string
		// This helps avoid partial matches like "123xyz" being treated as 123
		if (String(num) === paramStr.trim()) {
			return num;
		}
	}
	
	// Handle strings that were quoted by the client's parseTriggerParamsRaw
	// parseTriggerParamsRaw adds quotes if they were originally there or if needed for commas
	// e.g. trigger(hello) -> param "hello"
	// e.g. trigger("hello world") -> param "\"hello world\""
	// e.g. trigger(123) -> param "123"
	// e.g. trigger("a,b") -> param "\"a,b\""
	
	if (paramStr.startsWith("\"") && paramStr.endsWith("\"")) {
		// This will remove one layer of quotes. If client sent ""hello"", server gets "hello"
		// If client sent "\"a,b\"", server gets "a,b"
		let unquoted = paramStr.substring(1, paramStr.length - 1);
		// Handle escaped quotes "" inside the string, turn them to single "
		unquoted = unquoted.replace(/""/g, "\"");
		return unquoted;
	}
	// It might also be useful to handle single quotes if the client could send them,
	// but current cli-parser focuses on double quotes for parameters with commas.
	
	return paramStr; // Return as is if no other type matches
}

/**
 * Parses the command string for a TRIGGER command (the part after "TRIGGER ").
 * Splits into triggerName and parameters, then types parameters using parseServerValue.
 * Client sends: TRIGGER triggerName rawParamStr1 rawParamStr2 ...
 * Example input for commandString: "myTrigger \"hello world\" true 123 \"a,b\""
 * @param {string} commandString The raw command string part after "TRIGGER ".
 * @returns {{triggerName: string, typedParamsArray: Array<boolean|number|string>}}
 */
function parseTriggerCommand(commandString) {
	if (typeof commandString !== "string" || commandString.trim() === "") {
		return {triggerName: "", typedParamsArray: []};
	}
	
	const parts = commandString.trim().split(/\s+/); // Split by one or more spaces
	const triggerName = parts[0];
	const rawParamsArray = parts.slice(1);
	
	const typedParamsArray = rawParamsArray.map(parseServerValue);
	
	return {triggerName, typedParamsArray};
}

module.exports = {parseTriggerCommand};

// cli-parser.js

/**
 * Parses a string value into its likely JavaScript type.
 * - "true" / "false" (case insensitive) become boolean.
 * - Numeric strings become numbers.
 * - Strings in single or double quotes have quotes removed.
 * @param {string} valueStr The string to parse.
 * @returns {boolean | number | string} The parsed value.
 */
function parseValue(valueStr) {
    if (typeof valueStr !== 'string') {
        return valueStr; // Or throw error, depending on desired strictness
    }

    const lowerValueStr = valueStr.toLowerCase();
    if (lowerValueStr === 'true') {
        return true;
    }
    if (lowerValueStr === 'false') {
        return false;
    }

    // Check if it's a number (integer or float)
    if (!isNaN(valueStr) && !isNaN(parseFloat(valueStr))) {
        // Handle cases like "  123  "
        const num = Number(valueStr);
        if (String(num) === valueStr.trim()) return num; // ensures "1.2.3" is not a number
    }

    // Handle quoted strings
    if ((valueStr.startsWith('"') && valueStr.endsWith('"')) || (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
        return valueStr.substring(1, valueStr.length - 1);
    }

    return valueStr;
}

/**
 * Parses a trigger parameter string (e.g., "param1,param2,\"a,b,c\",true") into an array of parsed values.
 * This parser handles parameters that are numbers, booleans, unquoted strings,
 * or double-quoted strings that can contain commas.
 * @param {string} paramsString The raw parameter string.
 * @returns {Array<boolean | number | string>} Array of parsed parameters.
 */
function parseTriggerParams(paramsString) {
    if (!paramsString || paramsString.trim() === "") {
        return [];
    }

    const params = [];
    let i = 0;
    let currentParam = "";
    let inQuotes = false;

    while (i < paramsString.length) {
        const char = paramsString[i];

        if (char === '"') {
            if (inQuotes && i + 1 < paramsString.length && paramsString[i+1] === '"') {
                // Escaped quote within a quote
                currentParam += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
                // Don't add the quote itself to currentParam unless it's an escaped one
            }
        } else if (char === ',' && !inQuotes) {
            params.push(parseValue(currentParam.trim()));
            currentParam = "";
        } else {
            currentParam += char;
        }
        i++;
    }
    params.push(parseValue(currentParam.trim())); // Add the last parameter

    return params;
}


/**
 * Parses CLI arguments and generates payload strings for the server.
 * @param {string} command The command type ("GET", "SET", "TRIGGER").
 * @param {string[]} args Array of raw string arguments from the CLI.
 * @returns {string[]} An array of payload strings.
 */
function parseCliArguments(command, args) {
    const commandUpper = command.toUpperCase();
    const payloads = [];

    if (commandUpper === "SET") {
        for (const argString of args) {
            const [key, ...valueParts] = argString.split("=");
            if (valueParts.length === 0) {
                // This case should ideally be caught by commander or earlier validation
                console.error(`error: missing value for set command for key "${key}"`);
                // Or throw an error to be handled by the caller
                process.exit(1); // Mirroring existing behavior in cli.js
            }
            const valueStr = valueParts.join("=");
            const parsedValue = parseValue(valueStr);
            // Server expects value as a string, but it might be typed by server later.
            // For now, ensure it's stringified for the payload.
            // Booleans become "true"/"false", numbers become "123", strings remain.
            payloads.push(`SET ${key} ${String(parsedValue)}`);
        }
    } else if (commandUpper === "GET") {
        for (const key of args) {
             if (key.includes("=")) {
                console.warn(`warning: value for GET command for key "${key.split("=")[0]}" will be ignored`);
                payloads.push(`GET ${key.split("=")[0]}`);
            } else {
                payloads.push(`GET ${key}`);
            }
        }
    } else if (commandUpper === "TRIGGER") {
        for (const argString of args) {
            const match = argString.match(/^([a-zA-Z0-9_.-]+)(?:\((.*)\))?$/);
            if (!match) {
                console.error(`error: invalid format for trigger argument: "${argString}"`);
                // Skip this arg, mirroring some of cli.js's original resilience
                continue;
            }
            const triggerName = match[1];
            const paramsString = match[2]; // undefined if no parens, empty string if "()"

            const parsedParams = parseTriggerParams(paramsString); // paramsString can be undefined

            // Construct payload: TRIGGER triggerName parsedParam1 parsedParam2 ...
            // Stringify parameters for sending.
            const payload = `TRIGGER ${triggerName}${parsedParams.length > 0 ? ' ' : ''}${parsedParams.map(String).join(' ')}`;
            payloads.push(payload);
        }
    } else {
        // Should not happen if command validation is done prior
        throw new Error(`Unknown command type: ${commandUpper}`);
    }
    return payloads;
}

module.exports = { parseCliArguments, parseValue, parseTriggerParams };

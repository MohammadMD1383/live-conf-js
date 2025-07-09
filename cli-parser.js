// cli-parser.js

/**
 * Parses a string value into its likely JavaScript type for SET commands.
 * - "true" / "false" (case insensitive) become boolean.
 * - Numeric strings become numbers.
 * - Strings in single or double quotes have quotes removed.
 * @param {string} valueStr The string to parse.
 * @returns {boolean | number | string} The parsed value.
 */
function parseSetValue(valueStr) {
    if (typeof valueStr !== 'string') {
        return valueStr;
    }

    const lowerValueStr = valueStr.toLowerCase();
    if (lowerValueStr === 'true') {
        return true;
    }
    if (lowerValueStr === 'false') {
        return false;
    }

    if (!isNaN(valueStr) && !isNaN(parseFloat(valueStr))) {
        const num = Number(valueStr);
        if (String(num) === valueStr.trim()) return num;
    }

    if ((valueStr.startsWith('"') && valueStr.endsWith('"')) || (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
        return valueStr.substring(1, valueStr.length - 1);
    }

    return valueStr;
}

/**
 * Parses a trigger parameter string (e.g., "param1,param2,\"a,b,c\",true") into an array of RAW string parameters.
 * This parser handles parameters that are numbers, booleans, unquoted strings,
 * or double-quoted strings that can contain commas. It preserves quotes for strings.
 * @param {string} paramsString The raw parameter string.
 * @returns {Array<string>} Array of raw parameters.
 */
function parseTriggerParamsRaw(paramsString) {
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
            // For raw parsing, keep the quote character as part of the param if it's not for escaping
            // but toggle state. If it's an escaped quote, add it and advance.
            if (inQuotes && i + 1 < paramsString.length && paramsString[i+1] === '"') {
                currentParam += '""'; // Keep as double quote for now, server will handle final unescaping
                i++;
            } else {
                inQuotes = !inQuotes;
                currentParam += '"'; // Add the quote
            }
        } else if (char === ',' && !inQuotes) {
            params.push(currentParam.trim());
            currentParam = "";
        } else {
            currentParam += char;
        }
        i++;
    }
    params.push(currentParam.trim()); // Add the last parameter

    // Filter out empty strings that might result from trailing commas or empty sections.
    return params.filter(p => p !== "");
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
                console.error(`error: missing value for set command for key "${key}"`);
                process.exit(1);
            }
            const valueStr = valueParts.join("=");
            const parsedValue = parseSetValue(valueStr);
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
                continue;
            }
            const triggerName = match[1];
            const paramsString = match[2];

            const rawParams = parseTriggerParamsRaw(paramsString); // paramsString can be undefined

            // Construct payload: TRIGGER triggerName rawParamStr1 rawParamStr2 ...
            // Parameters are already strings, just join them.
            const payload = `TRIGGER ${triggerName}${rawParams.length > 0 ? ' ' : ''}${rawParams.join(' ')}`;
            payloads.push(payload);
        }
    } else {
        throw new Error(`Unknown command type: ${commandUpper}`);
    }
    return payloads;
}

module.exports = { parseCliArguments };

// server-command-parser.js

/**
 * Parses the command string for a TRIGGER command.
 * Example input: "myTrigger param1Value someOtherParam true 123"
 * @param {string} commandString The raw command string part after "TRIGGER ".
 * @returns {{triggerName: string, paramsArray: string[]}}
 */
function parseTriggerCommand(commandString) {
    if (typeof commandString !== 'string' || commandString.trim() === '') {
        // This case should ideally be caught before calling, or handle as error
        return { triggerName: '', paramsArray: [] };
    }

    const parts = commandString.trim().split(/\s+/); // Split by one or more spaces
    const triggerName = parts[0];
    const paramsArray = parts.slice(1);

    return { triggerName, paramsArray };
}

module.exports = { parseTriggerCommand };

# Live Conf

Change your application's configuration in real-time!

`live-conf` is a Node.js module that allows you to dynamically get and set configuration values and trigger functions in a running Node.js application from an external command-line interface (CLI). This is achieved through Unix domain sockets, providing a fast and secure way to interact with your live application without requiring restarts.

## Features

*   **Real-time Configuration:** View and update configuration variables on the fly.
*   **Trigger Functions:** Execute predefined functions within your running application.
*   **CLI Tool (`lc`):** Easy-to-use command-line interface for interacting with your application.
*   **Unix Socket Communication:** Fast and secure inter-process communication.
*   **Aliasing:** Assign human-readable aliases to your process IDs for easier CLI usage.
*   **Type-aware Parsing:** CLI and server intelligently parse strings, numbers, and booleans.

## Installation

```bash
npm install live-conf
```

## Usage

There are two main parts to using `live-conf`:

1.  **Integrating into your Node.js Application**
2.  **Using the `lc` Command-Line Tool**

### Integrating into Your Application

First, require the `live-conf` module in your application:

```javascript
const liveConf = require('live-conf');
```

#### `liveConf.registerConfig(key, type, endpoint)`

This function registers a configuration variable that can be accessed or modified by the `lc` CLI.

*   `key` (String): The name of the configuration variable.
*   `type` (String): A descriptive type for your configuration (e.g., "string", "number", "boolean"). This is currently for informational purposes.
*   `endpoint` (Object): An object with optional `get` and `set` methods.
    *   `get()`: A function that returns the current value of the configuration.
    *   `set(value)`: A function that receives a new value and updates the configuration. The `value` will be automatically parsed from the CLI input into a string, number, or boolean.

**Example:**

```javascript
let currentLogLevel = 'info';
const featureFlags = {
    newReporting: true,
    oldDashboard: false,
};

// Register a simple string configuration
liveConf.registerConfig('logLevel', 'string', {
    get: () => currentLogLevel,
    set: (newValue) => {
        if (['debug', 'info', 'warn', 'error'].includes(newValue)) {
            currentLogLevel = newValue;
            console.log(`Log level changed to: ${currentLogLevel}`);
        } else {
            throw new Error('Invalid log level');
        }
    }
});

// Register a configuration for a specific feature flag (boolean)
liveConf.registerConfig('feature.newReporting', 'boolean', {
    get: () => featureFlags.newReporting,
    set: (newValue) => {
        if (typeof newValue === 'boolean') {
            featureFlags.newReporting = newValue;
            console.log(`Feature 'newReporting' set to: ${featureFlags.newReporting}`);
        } else {
            throw new Error('Invalid boolean value for feature flag');
        }
    }
});

// Register a read-only configuration
liveConf.registerConfig('appVersion', 'string', {
    get: () => require('./package.json').version
});
```

#### `liveConf.on(triggerName, callback)`

This function registers a named function (trigger) that can be executed by the `lc` CLI.

*   `triggerName` (String): The name of the trigger.
*   `callback(...args)`: A function to be executed. Arguments passed from the CLI will be provided to this callback, parsed into their respective types (string, number, boolean).

**Example:**

```javascript
liveConf.on('refreshCache', (cacheKey, duration) => {
    console.log(`Refreshing cache for key: ${cacheKey} with duration: ${duration}ms`);
    // Actual cache refresh logic here
    if (typeof cacheKey !== 'string' || typeof duration !== 'number') {
        throw new Error('Invalid parameters for refreshCache: cacheKey (string), duration (number) expected.');
    }
    // ... your logic
});

liveConf.on('notifyUsers', (message) => {
    console.log(`Notifying users: ${message}`);
    // ... your logic
});
```

#### `liveConf.alias(id)`

This function creates a human-readable alias for the current process. The `lc` CLI can then use this alias instead of the process ID. Socket files are created in `/tmp/.live-conf/`.

*   `id` (String): The alias to create (e.g., "my-app-main").

**Example:**

```javascript
liveConf.alias('my-app-main');
// Now you can use `lc my-app-main ...` instead of `lc <pid> ...`
```
If an alias is not set, you will need to use the process ID of your Node.js application.

### Using the `lc` Command-Line Tool

The `lc` tool is the interface for interacting with your `live-conf` enabled application.

**Basic Syntax:**

```bash
lc <pid|alias> <command> [args...]
```

*   `<pid|alias>`: The process ID of your Node.js application or an alias you've set using `liveConf.alias()`.
*   `<command>`: One of `get`, `set`, or `trigger`.
*   `[args...]`: Arguments specific to the command.

#### `get` Command

Retrieves the current value of one or more registered configurations.

**Syntax:**

```bash
lc <pid|alias> get <key1> [key2...]
```

**Example:**

```bash
# Get the value of 'logLevel'
lc my-app-main get logLevel

# Get values of 'logLevel' and 'appVersion'
lc 12345 get logLevel appVersion
```

Output will be the value of the key, or an error message if the key is not found or reading is not supported.

#### `set` Command

Updates the value of one or more registered configurations.

**Syntax:**

```bash
lc <pid|alias> set <key1=value1> [key2=value2...]
```

*   Values are parsed:
    *   `true` / `false` (case-insensitive) become booleans.
    *   Numeric strings (e.g., `123`, `45.6`) become numbers.
    *   Strings enclosed in single (`'`) or double (`"`) quotes have the quotes removed (e.g., `"hello world"` becomes `hello world`).
    *   Other values are treated as strings.

**Example:**

```bash
# Set 'logLevel' to 'debug'
lc my-app-main set logLevel=debug

# Set 'feature.newReporting' to true and 'itemsPerPage' to 50
lc my-app-main set feature.newReporting=true itemsPerPage=50

# Set a username
lc my-app-main set username="John Doe"
```

Output will be `OK` for successful sets, or an error message.

#### `trigger` Command

Executes a registered trigger function.

**Syntax:**

```bash
lc <pid|alias> trigger <triggerName1(param1,param2,...)> [triggerName2(p1,p2,...)...]
```

*   Parameters are passed within parentheses after the trigger name.
*   Parameters are comma-separated.
*   Parameters are parsed similarly to `set` values:
    *   `true` / `false` become booleans.
    *   Numeric strings become numbers.
    *   To include a comma within a string parameter, or to ensure it's treated as a string if it looks like a number/boolean, enclose it in double quotes: `"this,is,one,param"`. Double quotes within a quoted string can be escaped by doubling them: `"""this has ""quotes"""""`.
    *   Unquoted parameters are parsed as numbers, booleans, or strings.

**Example:**

```bash
# Trigger 'refreshCache' with string 'user-data' and number 1000
lc my-app-main trigger refreshCache(user-data,1000)

# Trigger 'notifyUsers' with a message
lc my-app-main trigger notifyUsers("System maintenance soon")

# Trigger multiple functions
lc my-app-main trigger sendAlert("High CPU",true) logEvent("System check initiated")

# Trigger with a parameter containing commas
lc my-app-main trigger updateTags("item1,\"tagA,tagB,tagC\",active")
# In the above, the callback for updateTags would receive:
# "item1" (string)
# "tagA,tagB,tagC" (string)
# "active" (string) - assuming 'active' is not 'true' or 'false'
```

Output will be `OK` for successful triggers, or an error message.

## How it Works

`live-conf` sets up a Unix domain socket server within your Node.js application. The socket file is typically created in `/tmp/.live-conf/` and named after the process ID (e.g., `/tmp/.live-conf/12345`). If you use `liveConf.alias('my-alias')`, an additional symlink or file named `/tmp/.live-conf/my-alias` will point to the actual process socket.

The `lc` CLI tool acts as a client, connecting to this socket to send commands (get, set, trigger) and receive responses. Communication is performed using a simple length-prefixed message protocol.

## Error Handling

If a command fails (e.g., key not found, set/get not supported, error within a trigger handler), the `lc` CLI will print an error message received from the application. Error messages from the application are prefixed with `ERROR` followed by an error code or description.

Example:
```
ERROR ERROR_KEY_NOT_FOUND
```
or if an operation within a handler fails:
```
ERROR ERROR_IN_OPERATION
```

## API Reference

### `liveConf.registerConfig(key: string, type: string, endpoint: { get?: () => any, set?: (value: any) => void })`
Registers a configuration that can be managed via the CLI.
*   `key`: The unique name for the configuration.
*   `type`: A string describing the type (e.g., "string", "number"). Currently for informational/documentation purposes.
*   `endpoint`:
    *   `get`: Optional function. Called when `lc get <key>` is used. Should return the config value.
    *   `set`: Optional function. Called when `lc set <key>=<value>` is used. Receives the parsed value.

### `liveConf.on(triggerName: string, callback: (...args: any[]) => void)`
Registers a function that can be called remotely via the CLI.
*   `triggerName`: The unique name for the trigger.
*   `callback`: The function to execute. Parameters from `lc trigger <name>(arg1,arg2)` are passed as arguments to this callback, with types inferred (string, number, boolean).

### `liveConf.alias(id: string)`
Creates a friendly alias for the process ID, making CLI usage simpler.
*   `id`: The string alias to use (e.g., "my-app").

## Keywords

live, realtime, config, dynamic, unix-socket, configuration, runtime, cli

## License

MIT
(See package.json for more details)

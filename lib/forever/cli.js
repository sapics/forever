/*
 * cli.js: Handlers for the forever CLI commands.
 *
 * (C) 2010 Charlie Robbins & the Contributors
 * MIT LICENCE
 *
 */

var fs = require('fs'),
    path = require('path'),
    colors = require('@colors/colors'),
    formatting = require('../util/cli-format'),
    shush = require('shush'),
    prettyjson = require('prettyjson'),
    clone = require('clone'),
    objectAssign = require('object-assign'),
    forever = require('../forever');

var cli = exports;
cli.argv = { _: [] };

var help = [
  'usage: forever [action] [options] SCRIPT [script-options]',
  '',
  'Monitors the script specified in the current process or as a daemon',
  '',
  'actions:',
  '  start               Start SCRIPT as a daemon',
  '  stop                Stop the daemon SCRIPT by Id|Uid|Pid|Index|Script',
  '  stopall             Stop all running forever scripts',
  '  restart             Restart the daemon SCRIPT',
  '  restartall          Restart all running forever scripts',
  '  list                List all running forever scripts',
  '  config              Lists all forever user configuration',
  '  set <key> <val>     Sets the specified forever config <key>',
  '  clear <key>         Clears the specified forever config <key>',
  '  logs                Lists log files for all forever processes',
  '  logs <script|index> Tails the logs for <script|index>',
  '  columns add <col>   Adds the specified column to the output in `forever list`. Supported columns: \'uid\', \'command\', \'script\', \'forever\', \'pid\', \'id\', \'logfile\', \'uptime\'',
  '  columns rm <col>    Removed the specified column from the output in `forever list`',
  '  columns set <cols>  Set all columns for the output in `forever list`',
  '  columns reset       Resets all columns to defaults for the output in `forever list`',
  '  cleanlogs           [CAREFUL] Deletes all historical forever log files',
  '',
  'options:',
  '  -m  MAX          Only run the specified script MAX times',
  '  -l  LOGFILE      Logs the forever output to LOGFILE',
  '  -o  OUTFILE      Logs stdout from child script to OUTFILE',
  '  -e  ERRFILE      Logs stderr from child script to ERRFILE',
  '  -p  PATH         Base path for all forever related files (pid files, etc.)',
  '  -c  COMMAND      COMMAND to execute (defaults to node)',
  '  -a, --append     Append logs',
  '  -f, --fifo       Stream logs to stdout',
  '  -n, --number     Number of log lines to print',
  '  --pidFile        The pid file',
  '  --uid            Process uid, useful as a namespace for processes (must wrap in a string)',
  '                   e.g. forever start --uid "production" app.js',
  '                       forever stop production',
  '  --sourceDir      The source directory for which SCRIPT is relative to',
  '  --workingDir     The working directory in which SCRIPT will execute',
  '  --minUptime      Minimum uptime (millis) for a script to not be considered "spinning"',
  '  --spinSleepTime  Time to wait (millis) between launches of a spinning script.',
  '  --colors         --no-colors will disable output coloring',
  '  --plain          alias of --no-colors',
  '  -d, --debug      Forces forever to log debug output',
  '  -v, --verbose    Turns on the verbose messages from Forever',
  '  -s, --silent     Run the child script silencing stdout and stderr',
  '  -w, --watch      Watch for file changes',
  '  --watchDirectory Top-level directory to watch from',
  '  --watchIgnore    To ignore pattern when watch is enabled (multiple option is allowed)',
  '  -t, --killTree   Kills the entire child process tree on `stop`',
  '  --killSignal     Support exit signal customization (default is SIGKILL)',
  '                   used for restarting script gracefully e.g. --killSignal=SIGTERM',
  '  --version        Print the current version',
  '  -h, --help       You\'re staring at it',
  '',
  '[Long Running Process]',
  '  The forever process will continue to run outputting log messages to the console.',
  '  ex. forever -o out.log -e err.log my-script.js',
  '',
  '[Daemon]',
  '  The forever process will run as a daemon which will make the target process start',
  '  in the background. This is extremely useful for remote starting simple node.js scripts',
  '  without using nohup. It is recommended to run start with -o -l, & -e.',
  '  ex. forever start -l forever.log -o out.log -e err.log my-daemon.js',
  '      forever stop my-daemon.js',
  ''
];

var app = {
  argv: cli.argv,
  config: {
    stores: {
      argv: { store: {} }
    },
    get: function (key) {
      return cli.argv[key];
    },
    use: function () {}
  },
  use: function () {},
  cmd: function () {},
  init: function (callback) {
    callback();
  },
  start: function () {
    dispatchCommand();
  }
};

var actions = [
  'start',
  'stop',
  'stopbypid',
  'stopall',
  'restart',
  'restartall',
  'list',
  'config',
  'set',
  'clear',
  'logs',
  'columns',
  'cleanlogs'
];

var argvOptions = cli.argvOptions = {
  'command':   {alias: 'c'},
  'errFile':   {alias: 'e'},
  'logFile':   {alias: 'l'},
  'killTree':  {alias: 't', boolean: true},
  'append':    {alias: 'a', boolean: true},
  'fifo':      {alias: 'f', boolean: true},
  'number':    {alias: 'n'},
  'max':       {alias: 'm'},
  'outFile':   {alias: 'o'},
  'path':      {alias: 'p'},
  'help':      {alias: 'h'},
  'silent':    {alias: 's', boolean: true},
  'verbose':   {alias: 'v', boolean: true},
  'watch':     {alias: 'w', boolean: true},
  'debug':     {alias: 'd', boolean: true},
  'plain':     {boolean: true},
  'uid':       {alias: 'u'},
  'version':   {boolean: true},
  'colors':    {boolean: true},
  'pidFile':   {},
  'sourceDir': {},
  'workingDir': {},
  'minUptime': {},
  'spinSleepTime': {},
  'watchDirectory': {},
  'watchIgnore': {},
  'killSignal': {},
  'id':        {}
};

var optionLookup = Object.keys(argvOptions).reduce(function (acc, key) {
  var alias = argvOptions[key].alias;

  acc[key] = key;
  if (alias) {
    acc[alias] = key;
  }

  return acc;
}, {});

function isOptionToken(token) {
  return typeof token === 'string' && token.length > 1 && token[0] === '-';
}

function isActionToken(token) {
  return actions.indexOf(token) !== -1;
}

function setOption(target, name, value) {
  if (typeof target[name] === 'undefined') {
    target[name] = value;
    return;
  }

  if (Array.isArray(target[name])) {
    target[name].push(value);
    return;
  }

  target[name] = [target[name], value];
}

function parseOptionTokens(tokens, target) {
  var options = target || {};
  var index = 0;

  while (index < tokens.length) {
    var token = tokens[index];
    var name;
    var value;

    if (token === '--') {
      break;
    }

    if (!isOptionToken(token)) {
      index += 1;
      continue;
    }

    if (token.slice(0, 5) === '--no-') {
      name = token.slice(5);
      if (optionLookup[name]) {
        setOption(options, optionLookup[name], false);
      }
      index += 1;
      continue;
    }

    if (token.slice(0, 2) === '--') {
      token = token.slice(2);
      value = true;
      if (token.indexOf('=') !== -1) {
        value = token.split('=');
        token = value.shift();
        value = value.join('=');
      }

      name = optionLookup[token];
      if (name) {
        if (value === true && !argvOptions[name].boolean && tokens[index + 1] && !isOptionToken(tokens[index + 1])) {
          value = tokens[index + 1];
          index += 1;
        }

        if (value === true && argvOptions[name].boolean) {
          value = true;
        }

        setOption(options, name, value);
      }

      index += 1;
      continue;
    }

    token = token.slice(1);
    while (token.length) {
      name = optionLookup[token[0]];
      if (!name) {
        token = token.slice(1);
        continue;
      }

      if (argvOptions[name].boolean || token.length > 1) {
        setOption(options, name, true);
        token = token.slice(1);
        continue;
      }

      if (tokens[index + 1] && !isOptionToken(tokens[index + 1])) {
        setOption(options, name, tokens[index + 1]);
        index += 1;
      }
      else {
        setOption(options, name, true);
      }

      token = '';
    }

    index += 1;
  }

  return options;
}

function getOptionSegmentEnd(tokens, startIndex) {
  var index = startIndex || 0;

  while (index < tokens.length) {
    var token = tokens[index];
    var name;

    if (token === '--') {
      return index + 1;
    }

    if (!isOptionToken(token)) {
      break;
    }

    if (token.slice(0, 5) === '--no-') {
      index += 1;
      continue;
    }

    if (token.slice(0, 2) === '--') {
      name = optionLookup[token.slice(2).split('=')[0]];

      if (name && token.indexOf('=') === -1 && !argvOptions[name].boolean && tokens[index + 1] && !isOptionToken(tokens[index + 1])) {
        index += 2;
        continue;
      }

      index += 1;
      continue;
    }

    token = token.slice(1);
    name = optionLookup[token[0]];

    if (name && token.length === 1 && !argvOptions[name].boolean && tokens[index + 1] && !isOptionToken(tokens[index + 1])) {
      index += 2;
      continue;
    }

    index += 1;
  }

  return index;
}

function buildArgv(rawArgs) {
  var argv = { _: [] };
  var index = getOptionSegmentEnd(rawArgs, 0);
  var action;
  var optionsEnd = index;
  action = rawArgs[index];

  if (isActionToken(action)) {
    parseOptionTokens(rawArgs.slice(0, optionsEnd), argv);

    var actionIndex = index + 1;
    var segmentEnd = getOptionSegmentEnd(rawArgs, actionIndex);

    parseOptionTokens(rawArgs.slice(actionIndex, segmentEnd), argv);

    if (action === 'start') {
      argv._.push(action);
      argv._.push.apply(argv._, rawArgs.slice(segmentEnd));
      return argv;
    }

    argv._.push(action);
    argv._.push.apply(argv._, rawArgs.slice(segmentEnd));
    return argv;
  }

  parseOptionTokens(rawArgs.slice(0, optionsEnd), argv);
  argv._.push.apply(argv._, rawArgs.slice(optionsEnd));
  return argv;
}

function renderHelp() {
  console.log(help.join('\n'));
}

function dispatchCommand() {
  var command = cli.argv._[0];

  if (command === 'help') {
    return cli.help();
  }

  if (!command) {
    return cli.run();
  }

  if (command === 'start' || actions.indexOf(command) === -1) {
    if (command === 'start') {
      return cli.startDaemon();
    }

    return cli.run();
  }

  switch (command) {
    case 'cleanlogs':
      return cli.cleanLogs();
    case 'stop':
      return cli.stop(cli.argv._[1]);
    case 'stopbypid':
      return cli.stopbypid(cli.argv._[1]);
    case 'stopall':
      return cli.stopall();
    case 'restart':
      return cli.restart(cli.argv._[1]);
    case 'restartall':
      return cli.restartAll();
    case 'list':
      return cli.list();
    case 'config':
      return cli.config();
    case 'set':
      return cli.set(cli.argv._[1], cli.argv._.slice(2).join(' '));
    case 'clear':
      return cli.clear(cli.argv._[1]);
    case 'logs':
      return typeof cli.argv._[1] !== 'undefined' ? cli.logs(cli.argv._[1]) : cli.logFiles();
    case 'columns':
      switch (cli.argv._[1]) {
        case 'add':
          return cli.addColumn(cli.argv._[2]);
        case 'rm':
          return cli.rmColumn(cli.argv._[2]);
        case 'set':
          return cli.setColumns(cli.argv._.slice(2).join(' '));
        case 'reset':
          return cli.resetColumns();
      }
      break;
    case 'help':
      return cli.help();
  }

  return cli.run();
}

var reserved = ['root', 'pidPath'];

//
// ### @private function (file, options, callback)
// #### @file {string} Target script to start
// #### @options {Object} Options to start the script with
// #### @callback {function} Continuation to respond to when complete.
// Helper function that sets up the pathing for the specified `file`
// then stats the appropriate files and responds.
//
function tryStart(file, options, callback) {
  var fullLog, fullScript;

  if (options.path) {
    forever.config.set('root', options.path);
    forever.root = options.path;
  }

  fullLog = forever.logFilePath(options.logFile, options.uid);
  fullScript = path.join(options.sourceDir, file);

  forever.stat(fullLog, fullScript, options.append, function (err) {
    if (err) {
      forever.log.error('Cannot start forever');
      forever.log.error(err.message);
      process.exit(-1);
    }

    callback();
  });
}

//
// ### @private function updateConfig (updater)
// #### @updater {function} Function which updates the forever config
// Helper which runs the specified `updater` and then saves the forever
// config to `forever.config.get('root')`.
//
function updateConfig(updater) {
  updater();
  forever.config.save(function (err) {
    if (err) {
      return forever.log.error('Error saving config: ' + err.message);
    }

    cli.config();
    var configFile = path.join(forever.config.get('root'), 'config.json');
    forever.log.info('Forever config saved: ' + configFile.yellow);
  });
}

//
// ### @private function checkColumn (name)
// #### @name {string} Column to check
// Checks if column `name` exists
//
function checkColumn(name) {
  if (!forever.columns[name]) {
    forever.log.error('Unknown column: ' + name.magenta);
    return false;
  }
  return true;
}

//
// ### function getOptions (file)
// #### @file {string} File to run. **Optional**
// Returns `options` object for use with `forever.start` and
// `forever.startDaemon`
//
var getOptions = cli.getOptions = function (file, scriptArgs) {
  var options = {},
      absFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file),
      configKeys = [
        'pidFile', 'logFile', 'errFile', 'watch', 'minUptime', 'append',
        'silent', 'outFile', 'max', 'command', 'path', 'spinSleepTime',
        'sourceDir', 'workingDir', 'uid', 'watchDirectory', 'watchIgnore',
        'killTree', 'killSignal', 'id'
      ],
      specialKeys = ['script', 'args'],
      configs;

  //
  // Load JSON configuration values
  //
  if (path.extname(file) === '.json') {
    configs = shush(absFile);
    configs = !Array.isArray(configs) ? [configs] : configs;

    configs = configs.map(function (conf) {
      var mut = Object.keys(conf)
        .reduce(function (acc, key) {
          if (~configKeys.indexOf(key) || ~specialKeys.indexOf(key)) {
            acc[key] = conf[key];
          }

          return acc;
        }, {});

      if (!mut.script) {
        forever.log.error('"script" option required in JSON configuration files');
        console.log(prettyjson.render(mut));
        process.exit(1);
      }

      return mut;
    });
  } else {
    options.script = file;
  }

  //
  // First isolate options which should be passed to file
  //
  options.args = scriptArgs || [];

  //
  // Now we have to force reparsing of command line options because
  // we've removed some before.
  //
  app.config.stores.argv.store = {};
  app.config.use('argv', argvOptions);

  configKeys.forEach(function (key) {
    options[key] = app.config.get(key);
  });

  options.watchIgnore         = options.watchIgnore || [];
  options.watchIgnorePatterns = Array.isArray(options.watchIgnore)
    ? options.watchIgnore
    : [options.watchIgnore];

  if (!options.minUptime) {
    forever.log.warn('--minUptime not set. Defaulting to: 1000ms');
    options.minUptime = 1000;
  }

  if (!options.spinSleepTime) {
    forever.log.warn([
      '--spinSleepTime not set. Your script',
      'will exit if it does not stay up for',
      'at least ' + options.minUptime + 'ms'
    ].join(' '));
  }

  function assignSpawnWith(options) {
    options.sourceDir  = options.sourceDir  || (file && !path.isAbsolute(file) ? process.cwd() : path.parse(file).root || '/');
    options.workingDir = options.workingDir || options.sourceDir;
    options.spawnWith  = { cwd: options.workingDir };
    return options;
  }

  if (configs && configs.length) {
    return configs.map(function (conf) {
      return assignSpawnWith(objectAssign(clone(options), conf));
    });
  }

  return [assignSpawnWith(options)];
};

//
// ### function cleanLogs
// Deletes all historical forever log files
//
app.cmd('cleanlogs', cli.cleanLogs = function () {
  forever.log.silly('Tidying ' + forever.config.get('root'));
  forever.cleanUp(true).on('cleanUp', function () {
    forever.log.silly(forever.config.get('root') + ' tidied.');
  });
});

//
// ### function start (file)
// #### @file {string} Location of the script to spawn with forever
// Starts a forever process for the script located at `file` as daemon
// process.
//
app.cmd(/start (.+)/, cli.startDaemon = function () {
  var file = cli.argv._[1],
      options = getOptions(file, cli.argv._.slice(2));

  options.forEach(function (o) {
    forever.log.info('Forever processing file: ' + o.script.grey);
    tryStart(o.script, o, function () {
      forever.startDaemon(o.script, o);
    });
  });

});

//
// ### function stop (file)
// #### @file {string} Target forever process to stop
// Stops the forever process specified by `file`.
//
app.cmd(/stop (.+)/, cli.stop = function (file) {
  var runner = forever.stop(file, true);

  runner.on('stop', function (process) {
    forever.log.info('Forever stopped process:' + '\n' + process);
  });

  runner.on('error', function (err) {
    forever.log.error('Forever cannot find process with id: ' + file);
    process.exit(1);
  });
});

//
// ### function stopbypid (pid)
// Stops running forever process by pid.
//
app.cmd(/stopbypid (.+)/, cli.stopbypid = function (pid) {
  forever.log.warn('Deprecated, try `forever stop ' + pid + '` instead.');
  cli.stop(pid);
});

//
// ### function stopall ()
// Stops all currently running forever processes.
//
app.cmd('stopall', cli.stopall = function () {
  var runner = forever.stopAll(true);
  runner.on('stopAll', function (processes) {
    if (processes) {
      forever.log.info('Forever stopped processes:');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });

  runner.on('error', function () {
    forever.log.info('No forever processes running');
  });
});

//
// ### function restartall ()
// Restarts all currently running forever processes.
//
app.cmd('restartall', cli.restartAll = function () {
  var runner = forever.restartAll(true);
  runner.on('restartAll', function (processes) {
    if (processes) {
      forever.log.info('Forever restarted processes:');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });

  runner.on('error', function () {
    forever.log.info('No forever processes running');
  });
});

//
// ### function restart (file)
// #### @file {string} Target process to restart
// Restarts the forever process specified by `file`.
//
app.cmd(/restart (.+)/, cli.restart = function (file) {
  var runner = forever.restart(file, true);
  runner.on('restart', function (processes) {
    if (processes) {
      forever.log.info('Forever restarted process(es):');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });

  runner.on('error', function (err) {
    forever.log.error('Error restarting process: ' + file.grey);
    forever.log.error(err.message);
    process.exit(1);
  });
});

//
// ### function list ()
// Lists all currently running forever processes.
//
app.cmd('list', cli.list = function () {
  forever.list(true, function (err, processes) {
    if (processes) {
      forever.log.info('Forever processes running');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });
});

//
// ### function config ()
// Lists all of the configuration in `~/.forever/config.json`.
//
app.cmd('config', cli.config = function () {
  var keys = Object.keys(forever.config.all),
      conf = formatting.inspect(forever.config.all, colors.mode !== 'none');

  if (keys.length <= 2) {
    conf = conf.replace(/\{\s/, '{ \n')
               .replace(/\}/, '\n}')
               .replace('\\033[90m', '  \\033[90m')
               .replace(/, /ig, ',\n  ');
  }
  else {
    conf = conf.replace(/\n\s{4}/ig, '\n  ');
  }

  conf.split('\n').forEach(function (line) {
    forever.log.data(line);
  });
});

//
// ### function set (key, value)
// #### @key {string} Key to set in forever config
// #### @value {string} Value to set for `key`
// Sets the specified `key` / `value` pair in the
// forever user config.
//
app.cmd(/set ([\w-_]+) (.+)/, cli.set = function (key, value) {
  updateConfig(function () {
    forever.log.info('Setting forever config: ' + key.grey);
    forever.config.set(key, value);
  });
});

//
// ### function clear (key)
// #### @key {string} Key to remove from `~/.forever/config.json`
// Removes the specified `key` from the forever user config.
//
app.cmd('clear :key', cli.clear = function (key) {
  if (reserved.indexOf(key) !== -1) {
    forever.log.warn('Cannot clear reserved config: ' + key.grey);
    forever.log.warn('Use `forever set ' + key + '` instead');
    return;
  }

  updateConfig(function () {
    forever.log.info('Clearing forever config: ' + key.grey);
    forever.config.clear(key);
  });
});

//
// ### function logs (target)
// #### @target {string} Target script or index to list logs for
// Displays the logs using `tail` for the specified `target`.
//
app.cmd('logs :index', cli.logs = function (index) {
  var options = {
      stream: cli.argv.fifo,
      length: cli.argv.number
  };

  forever.tail(index, options, function (err, log) {
    if (err) {
      return forever.log.error(err.message);
    }

    forever.log.data(log.file.magenta + ':' + log.pid + ' - ' + log.line);

  });
});

//
// ### function logFiles ()
// Display log files for all running forever processes.
//
app.cmd('logs', cli.logFiles = function (index) {
  if (typeof index !== 'undefined') {
    return;
  }

  var rows = [['   ', 'script', 'logfile']];
  index = 0;

  forever.list(false, function (err, processes) {
    if (!processes) {
      return forever.log.warn('No forever logfiles in ' + forever.config.get('root').magenta);
    }

    forever.log.info('Logs for running Forever processes');
    rows = rows.concat(processes.map(function (proc) {
      return ['[' + index++ + ']', proc.file.grey, proc.logFile.magenta];
    }));

    formatting.stringifyRows(rows, ['white', 'grey', 'magenta']).split('\n').forEach(function (line) {
      forever.log.data(line);
    });
  });
});


app.cmd('columns add :name', cli.addColumn = function (name) {
  if (checkColumn(name)) {
    var columns = forever.config.get('columns');

    if (~columns.indexOf(name)) {
      return forever.log.warn(name.magenta + ' already exists in forever');
    }

    forever.log.info('Adding column: ' + name.magenta);
    columns.push(name);

    forever.config.set('columns', columns);
  }
});

app.cmd('columns rm :name', cli.rmColumn = function (name) {
  if (checkColumn(name)) {
    var columns = forever.config.get('columns');

    if (!~columns.indexOf(name)) {
      return forever.log.warn(name.magenta + ' doesn\'t exist in forever');
    }

    forever.log.info('Removing column: ' + name.magenta);
    columns.splice(columns.indexOf(name), 1);

    forever.config.set('columns', columns);
  }
});

app.cmd(/columns set (.*)/, cli.setColumns = function (columns) {
  forever.log.info('Setting columns: ' + columns.magenta);

  forever.config.set('columns', columns.split(' '));
});

app.cmd('columns reset', cli.resetColumns = function () {
  var columns = 'uid command script forever pid logfile uptime';

  forever.log.info('Setting columns: ' + columns.magenta);

  forever.config.set('columns', columns.split(' '));
});

//
// ### function help ()
// Shows help
//
app.cmd('help', cli.help = function () {
  renderHelp();
});

//
// ### function start (file)
// #### @file {string} Location of the script to spawn with forever
// Starts a forever process for the script located at `file` as non-daemon
// process.
//
// Remark: this regex matches everything. It has to be added at the end to
// make executing other commands possible.
//
cli.run = function () {
  var file = cli.argv._[0],
      options = getOptions(file, cli.argv._.slice(1));

  options.forEach(function (o) {
    tryStart(o.script, o, function () {
      var monitor = forever.start(o.script, o);
      monitor.on('start', function () {
        forever.startServer(monitor);
      });
    });
  });
};

cli.start = function () {
  cli.argv = buildArgv(process.argv.slice(2));
  app.argv = cli.argv;

  if (cli.argv.version) {
    return console.log('v' + forever.version);
  }

  //
  // Check for --no-colors/--colors and --plain option
  //
  if ((typeof cli.argv.colors !== 'undefined' && !cli.argv.colors) || cli.argv.plain) {
    colors.mode = 'none';
  }

  if (cli.argv.help || cli.argv._[0] === 'help') {
    return renderHelp();
  }

  app.init(function () {
    if (cli.argv._.length && actions.indexOf(cli.argv._[0]) === -1) {
      return cli.run();
    }

    app.start();
  });
};

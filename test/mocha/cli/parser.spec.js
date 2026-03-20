const { expect } = require('chai');
const colors = require('@colors/colors');

const cli = require('../../../lib/forever/cli');
const forever = require('../../../lib/forever');

describe('cli parser', () => {
  const originalArgv = process.argv.slice();
  const originalMode = colors.mode;
  const originalRun = cli.run;
  const originalStartDaemon = cli.startDaemon;
  const originalSetColumns = cli.setColumns;
  const originalConsoleLog = console.log;

  afterEach(() => {
    process.argv = originalArgv.slice();
    colors.mode = originalMode;
    cli.run = originalRun;
    cli.startDaemon = originalStartDaemon;
    cli.setColumns = originalSetColumns;
    cli.argv = { _: [] };
    console.log = originalConsoleLog;
  });

  it('routes --version before command dispatch', () => {
    const logs = [];

    process.argv = ['node', 'bin/forever', '--version'];
    cli.run = () => {
      throw new Error('cli.run should not be called for --version');
    };
    cli.startDaemon = () => {
      throw new Error('cli.startDaemon should not be called for --version');
    };
    console.log = message => logs.push(message);

    cli.start();

    expect(logs).to.deep.equal([`v${forever.version}`]);
  });

  it('collects repeated options and preserves script arguments for start', () => {
    let observed;

    process.argv = [
      'node',
      'bin/forever',
      'start',
      '--watchIgnore',
      'logs/**',
      '--watchIgnore',
      'tmp/**',
      '--uid',
      'sample-app',
      'test/fixtures/server.js',
      '--port',
      '8080'
    ];

    cli.startDaemon = () => {
      observed = {
        argv: {
          watchIgnore: cli.argv.watchIgnore,
          uid: cli.argv.uid,
          positional: cli.argv._.slice()
        },
        options: cli.getOptions(cli.argv._[1], cli.argv._.slice(2))[0]
      };
    };

    cli.start();

    expect(observed.argv.watchIgnore).to.deep.equal(['logs/**', 'tmp/**']);
    expect(observed.argv.uid).to.equal('sample-app');
    expect(observed.argv.positional).to.deep.equal([
      'start',
      'test/fixtures/server.js',
      '--port',
      '8080'
    ]);
    expect(observed.options.watchIgnorePatterns).to.deep.equal(['logs/**', 'tmp/**']);
    expect(observed.options.uid).to.equal('sample-app');
    expect(observed.options.args).to.deep.equal(['--port', '8080']);
    expect(observed.options.script).to.equal('test/fixtures/server.js');
  });

  it('parses leading options with values before the script command', () => {
    let observed;

    process.argv = [
      'node',
      'bin/forever',
      '-l',
      'forever.log',
      '-o',
      'out.log',
      'test/fixtures/server.js',
      '--port',
      '8081'
    ];

    cli.run = () => {
      observed = {
        argv: {
          logFile: cli.argv.logFile,
          outFile: cli.argv.outFile,
          positional: cli.argv._.slice()
        },
        options: cli.getOptions(cli.argv._[0], cli.argv._.slice(1))[0]
      };
    };

    cli.start();

    expect(observed.argv.logFile).to.equal('forever.log');
    expect(observed.argv.outFile).to.equal('out.log');
    expect(observed.argv.positional).to.deep.equal([
      'test/fixtures/server.js',
      '--port',
      '8081'
    ]);
    expect(observed.options.logFile).to.equal('forever.log');
    expect(observed.options.outFile).to.equal('out.log');
    expect(observed.options.args).to.deep.equal(['--port', '8081']);
  });

  it('joins trailing arguments for columns set dispatch', () => {
    let columns;

    process.argv = ['node', 'bin/forever', 'columns', 'set', 'uid', 'script', 'logfile'];
    cli.setColumns = value => {
      columns = value;
    };

    cli.start();

    expect(columns).to.equal('uid script logfile');
  });

  it('disables colors for plain output mode', () => {
    process.argv = ['node', 'bin/forever', '--plain', 'help'];
    cli.run = () => {
      throw new Error('cli.run should not be called for help');
    };

    cli.start();

    expect(colors.mode).to.equal('none');
  });
});
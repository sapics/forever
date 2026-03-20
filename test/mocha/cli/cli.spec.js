const { delayPromise } = require('../../helpers/utils');

const { execCommand } = require('cli-testlab');

describe('cli', () => {
  describe('meta commands', function () {
    this.timeout(5000);

    it('prints the current version', function () {
      const version = require('../../../package.json').version;

      return execCommand('node bin/forever --version', {
        expectedOutput: [`v${version}`]
      });
    });
  });

  describe('columns', function () {
    this.timeout(5000);
    it('manages columns successfully', function () {
      return execCommand(`node bin/forever columns reset`,
          {
            expectedOutput: ['Setting columns:', 'uid command script forever pid logfile uptime']
          })
          .then(function () {
            return execCommand(`node bin/forever columns rm uptime`,
                {
                  expectedOutput: ['Removing column:', 'uptime']
                });
          })
          .then(function () {
            return execCommand(`node bin/forever columns add uptime`,
                {
                  expectedOutput: ['Adding column:', 'uptime']
                });
          })
          .then(function () {
            return execCommand(`node bin/forever columns add uptime`,
                {
                  expectedOutput: ['warn', 'uptime', 'already exists in forever']
                });
          })
          .then(function () {
            return execCommand('node bin/forever columns set uid script logfile', {
              expectedOutput: ['Setting columns:', 'uid script logfile']
            });
          });
    });
  });
  describe('start', () => {
    it('starts script successfully', () => {
      const oldDir = process.cwd();
      process.chdir('test/mocha/cli/scripts/dir with spaces/');
      return execCommand(
        `node ../../../../../bin/forever start script_name.js`,
        {
          expectedOutput: ['Forever processing file:', 'script_name.js'],
        }
      )
        .then(() => {
          return delayPromise(1000);
        })
        .then(() => {
          return execCommand(`node ../../../../../bin/forever stopall`, {
            expectedOutput: ['Forever stopped processes', 'script_name.js'],
          });
        })
        .then(() => {
          process.chdir(oldDir);
        });
    });
  });
});

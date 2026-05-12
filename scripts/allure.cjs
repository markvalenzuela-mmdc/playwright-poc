const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/allure.cjs <allure args>');
  process.exit(1);
}

const allureLibWildcard = path.join(
  process.cwd(),
  'node_modules',
  'allure-commandline',
  'dist',
  'lib',
  '*'
);

const javaArgs = ['-cp', allureLibWildcard, 'io.qameta.allure.CommandLine', ...args];

const child = spawn('java', javaArgs, {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

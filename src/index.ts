import React from 'react';
import { render } from 'ink';
import { runCli } from './cli/index.js';
import { App } from './tui/App.js';

async function main() {
  const argv = process.argv;
  if (argv.length <= 2) {
    if (!process.stdin.isTTY) {
      console.error('node-pm TUI requires an interactive terminal (no TTY detected on stdin).');
      console.error('Try running directly: node dist/index.js');
      process.exit(1);
    }
    // Enter alternate screen buffer + clear + cursor home
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');
    const restore = () => process.stdout.write('\x1b[?1049l');
    process.on('exit', restore);
    process.on('SIGINT', () => { restore(); process.exit(130); });
    process.on('SIGTERM', () => { restore(); process.exit(143); });
    const instance = render(React.createElement(App), {
      stdin: process.stdin,
      stdout: process.stdout,
      exitOnCtrlC: true,
    });
    await instance.waitUntilExit();
    return;
  }
  await runCli(argv);
}

main().catch((err: unknown) => {
  const code = (err as { code?: string }).code;
  if (code === 'commander.helpDisplayed' || code === 'commander.version') {
    process.exit(0);
  }
  if (code === 'commander.help') {
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

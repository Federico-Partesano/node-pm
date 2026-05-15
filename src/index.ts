import React from 'react';
import { render } from 'ink';
import { runCli } from './cli/index.js';
import { App } from './tui/App.js';

async function main() {
  const argv = process.argv;
  if (argv.length <= 2) {
    render(React.createElement(App));
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

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

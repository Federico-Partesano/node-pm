import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerScan } from './commands/scan.js';
import { registerList } from './commands/list.js';
import { registerAdd } from './commands/add.js';
import { registerRm } from './commands/rm.js';
import { registerClone } from './commands/clone.js';
import { registerPull } from './commands/pull.js';
import { registerStatus } from './commands/status.js';
import { registerInstall } from './commands/install.js';

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program.name('pm').description('node-pm: TUI-first manager for local Node project repos');
  program.exitOverride();   // do not call process.exit, throw instead — needed for tests
  registerInit(program);
  registerScan(program);
  registerList(program);
  registerAdd(program);
  registerRm(program);
  registerClone(program);
  registerPull(program);
  registerStatus(program);
  registerInstall(program);
  await program.parseAsync(argv);
}

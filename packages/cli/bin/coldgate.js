#!/usr/bin/env node
import { main as scan } from '../src/cli.ts';
import { main as trace } from '../../trace/src/cli.ts';
import { main as diff } from '../../diff/src/cli.ts';

const [command, ...args] = process.argv.slice(2);
if (command === 'scan') process.exitCode = await scan(args);
else if (command === 'diff') process.exitCode = await diff(args);
else if (command === 'trace') process.exitCode = await trace(args);
else {
  const help = command === '--help' || command === '-h' || command === undefined;
  (help ? process.stdout : process.stderr).write('Usage: coldgate <scan|diff|trace> [arguments]\nUse coldgate scan --help or coldgate diff --help or coldgate trace --help for details.\n');
  process.exitCode = help ? 0 : 2;
}

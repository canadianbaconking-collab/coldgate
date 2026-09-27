import { stripTypeScriptTypes } from 'node:module';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'dist');
const directories = ['authority', 'cli', 'diff', 'trace'];

// All runtime imports are relative. Only source files are copied to the package.
function rewriteImports(code) {
  return code.replace(/(['"])(\.{1,2}\/[^'"\r\n]+)\.ts\1/g, (_, quote, path) => `${quote}${path}.js${quote}`);
}

await rm(output, { recursive: true, force: true });
for (const name of directories) {
  const source = join(root, 'packages', name, 'src');
  const target = join(output, 'packages', name, 'src');
  await mkdir(target, { recursive: true });
  for (const file of await readdir(source)) {
    if (!file.endsWith('.ts')) throw Error(`Unexpected source file in ${source}: ${file}`);
    const code = await readFile(join(source, file), 'utf8');
    await writeFile(join(target, file.replace(/\.ts$/, '.js')), rewriteImports(stripTypeScriptTypes(code)));
  }
}
const bin = await readFile(join(root, 'packages', 'cli', 'bin', 'coldgate.js'), 'utf8');
const binPath = join(output, 'packages', 'cli', 'bin');
await mkdir(binPath, { recursive: true });
await writeFile(join(binPath, 'coldgate.js'), rewriteImports(bin), { mode: 0o755 });

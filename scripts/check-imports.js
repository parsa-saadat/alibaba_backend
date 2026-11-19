import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function checkImports() {
  let checked = 0;
  const missing = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isDirectory()) await walk(path);
      else if (path.endsWith('.js')) {
        const text = (await readFile(path, 'utf8')).replace(/^\s*\/\/.*$/gm, '');
        const pattern = /(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g;
        for (const match of text.matchAll(pattern)) {
          checked++;
          const target = resolve(dirname(path), match[1]);
          try {
            if (!(await stat(target)).isFile()) missing.push({ path, target });
          } catch {
            missing.push({ path, target });
          }
        }
      }
    }
  }
  for (const dir of ['src', 'scripts']) await walk(resolve(root, dir));
  return { checked, missing };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkImports();
  console.log(JSON.stringify(result, null, 2));
  if (result.missing.length) process.exitCode = 1;
}

// npm's install resolver treats a root package's `bundleDependencies` as part of
// the dependency graph: those nodes are validated against each dependent's raw
// version range and deliberately ignore root `overrides`. The audited tree pins
// katex 0.19.0 through `overrides`, while rehype-katex/remark-math still declare
// katex ^0.16.0. With katex at the root and bundled, a cold `npm ci` therefore
// alternates forever between an invalid edge and a replacement in Arborist's
// placeDep until the process exhausts its heap (GitHub macOS run 39744908034).
//
// Bundling is only needed when npm packs or publishes the package: local file:
// tarball installs ignore the packaged npm-shrinkwrap.json and the overrides it
// declares. Inject the audited runtime closure right before npm pack and restore
// the source manifest afterwards, so source installs keep the normal
// override-resolved tree while consumers still receive the patched subtree.
//
// Recovery safety: the backup is only ever discarded by writing it back over a
// manifest that is byte-identical to the exact form `inject()` produced from it
// (expected injected text) or to the backup itself. If the current manifest was
// edited after an interrupted pack, neither the edited manifest nor the backup
// is touched: the command fails with a recovery error and the operator decides
// how to merge the two.
import {access, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';

const MANIFEST = 'package.json';
const BACKUP = join('.reader-runtime', 'package-json-before-pack.json');
const BUNDLES = [
  '@types/debug',
  '@types/hast',
  '@types/katex',
  '@types/mdast',
  '@types/ms',
  '@types/unist',
  'bail',
  'character-entities',
  'comma-separated-tokens',
  'commander',
  'core-util-is',
  'debug',
  'decode-named-character-reference',
  'dequal',
  'devlop',
  'extend',
  'hast-util-from-dom',
  'hast-util-from-html',
  'hast-util-from-html-isomorphic',
  'hast-util-from-parse5',
  'hast-util-is-element',
  'hast-util-parse-selector',
  'hast-util-to-text',
  'hastscript',
  'https',
  'image-size',
  'immediate',
  'inherits',
  'is-plain-obj',
  'isarray',
  'jszip',
  'katex',
  'lie',
  'longest-streak',
  'mdast-util-from-markdown',
  'mdast-util-math',
  'mdast-util-phrasing',
  'mdast-util-to-markdown',
  'mdast-util-to-string',
  'micromark',
  'micromark-core-commonmark',
  'micromark-extension-math',
  'micromark-factory-destination',
  'micromark-factory-label',
  'micromark-factory-space',
  'micromark-factory-title',
  'micromark-factory-whitespace',
  'micromark-util-character',
  'micromark-util-chunked',
  'micromark-util-classify-character',
  'micromark-util-combine-extensions',
  'micromark-util-decode-numeric-character-reference',
  'micromark-util-decode-string',
  'micromark-util-edit-map',
  'micromark-util-encode',
  'micromark-util-html-tag-name',
  'micromark-util-normalize-identifier',
  'micromark-util-resolve-all',
  'micromark-util-sanitize-uri',
  'micromark-util-subtokenize',
  'micromark-util-symbol',
  'micromark-util-types',
  'ms',
  'pako',
  'parse5',
  'pptxgenjs',
  'process-nextick-args',
  'property-information',
  'readable-stream',
  'rehype-katex',
  'remark-math',
  'safe-buffer',
  'setimmediate',
  'space-separated-tokens',
  'string_decoder',
  'trough',
  'unified',
  'unist-util-find-after',
  'unist-util-is',
  'unist-util-remove-position',
  'unist-util-stringify-position',
  'unist-util-visit',
  'unist-util-visit-parents',
  'util-deprecate',
  'vfile',
  'vfile-location',
  'vfile-message',
  'web-namespaces',
  'zwitch',
];

// Resolve against the project root (or an explicit --directory) so the hook is
// testable against an isolated fixture without touching the real manifest.
const directoryArgument = () => {
  const index = process.argv.indexOf('--directory');
  return index === -1 ? undefined : process.argv[index + 1];
};
const error = message => new Error(message);

const exists = async path => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const writeAtomic = async (path, text) => {
  const temporary = `${path}.prepack-tmp`;
  await writeFile(temporary, text, 'utf8');
  await rename(temporary, path);
};

const createWorkspace = directory => {
  const root = directory === undefined ? process.cwd() : resolve(directory);
  const paths = {manifest: join(root, MANIFEST), backup: join(root, BACKUP), expected: join(root, `${BACKUP}.expected`)};
  return {...paths, root, relative: path => (isAbsolute(path) ? path.slice(root.length + 1) : path)};
};

// The exact bytes `inject()` writes for a given source manifest. Deterministic,
// so the untouched injected form can be recognised byte-for-byte.
const injectedText = source => {
  const manifest = JSON.parse(source);
  manifest.bundleDependencies = BUNDLES;
  return `${JSON.stringify(manifest, null, 2)}\n`;
};

const pendingBackup = async paths => (await exists(paths.backup) ? readFile(paths.backup, 'utf8') : undefined);

// Returns true when the backup was consumed. Refuses, without modifying either
// manifest, whenever the current package.json is not a form the hook itself
// produced from that backup.
const restore = async paths => {
  const backup = await pendingBackup(paths);
  if (backup === undefined) {
    return false;
  }
  if (!(await exists(paths.manifest))) {
    throw error(`recovery required: ${paths.relative(paths.backup)} exists but ${MANIFEST} is missing; both are preserved, restore the manifest manually`);
  }
  const current = await readFile(paths.manifest, 'utf8');
  if (current !== backup) {
    let expected;
    try {
      expected = await readFile(paths.expected, 'utf8');
    } catch {
      expected = undefined;
    }
    const injected = expected ?? injectedText(backup);
    if (current !== injected) {
      throw error(
        `recovery required: ${MANIFEST} differs from the injected form recorded by the prepack hook while ${paths.relative(paths.backup)} is still pending. ` +
          `Neither file was modified: merge the original manifest from ${paths.relative(paths.backup)} into ${MANIFEST} manually, then delete the backup and rerun`,
      );
    }
  }
  await writeAtomic(paths.manifest, backup);
  await rm(paths.expected, {force: true});
  await rm(paths.backup, {force: true});
  return true;
};

const inject = async paths => {
  // Recover the source manifest first if an earlier pack was interrupted.
  await restore(paths);
  const source = await readFile(paths.manifest, 'utf8');
  const manifest = JSON.parse(source);
  if (manifest.bundleDependencies || manifest.bundledDependencies) {
    throw error(`source ${MANIFEST} must not declare bundleDependencies; they are injected at pack time`);
  }
  const missing = [];
  for (const name of BUNDLES) {
    if (!(await exists(join(paths.root, 'node_modules', name, 'package.json')))) {
      missing.push(name);
    }
  }
  if (missing.length) {
    throw error(`cannot bundle missing dependencies (run npm ci first): ${missing.join(', ')}`);
  }
  const target = injectedText(source);
  await mkdir(dirname(paths.backup), {recursive: true});
  await writeFile(paths.backup, source, 'utf8');
  await writeFile(paths.expected, target, 'utf8');
  await writeAtomic(paths.manifest, target);
};

try {
  const mode = process.argv[2];
  const paths = createWorkspace(directoryArgument());
  if (mode === 'inject') {
    await inject(paths);
  } else if (mode === 'restore') {
    await restore(paths);
  } else {
    throw error('usage: prepare-package-bundles.mjs <inject|restore> [--directory <dir>]');
  }
} catch (problem) {
  console.error(`[prepare-package-bundles] ${problem instanceof Error ? problem.message : String(problem)}`);
  process.exitCode = 1;
}

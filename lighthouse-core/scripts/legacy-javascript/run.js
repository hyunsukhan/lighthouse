/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const {execFileSync} = require('child_process');
const makeHash = require('./hash.js');
const LegacyJavascript = require('../../audits/byte-efficiency/legacy-javascript.js');
const networkRecordsToDevtoolsLog = require('../../test/network-records-to-devtools-log.js');

// Create variants in a directory named-cached by contents of this script and the lockfile.
// This folder is in the CI cache, so that the time consuming part of this test only runs if
// the output would change.
removeCoreJs(); // (in case the script was canceled halfway - there shouldn't be a core-js dep checked in.)

const hash = makeHash();
const VARIANT_DIR = `${__dirname}/variants/${hash}`;

// build, audit, all.
const STAGE = process.env.STAGE || 'all';

const mainCode = fs.readFileSync(`${__dirname}/main.js`, 'utf-8');

const plugins = LegacyJavascript.getTransformPatterns().map(pattern => pattern.name);
const polyfills = LegacyJavascript.getPolyfillData();

/**
 * @param {string} command
 * @param {string[]} args
 */
function runCommand(command, args) {
  execFileSync(command, args, {cwd: __dirname});
}

/**
 * @param {number} version
 */
function installCoreJs(version) {
  runCommand('yarn', [
    'add',
    `core-js@${version}`,
  ]);
}

function removeCoreJs() {
  try {
    runCommand('yarn', [
      'remove',
      'core-js',
    ]);
  } catch (e) { }
}

/**
 * @param {{group: string, name: string, code: string, babelrc?: *}} options
 */
async function createVariant(options) {
  const {group, name, code, babelrc} = options;
  const dir = `${VARIANT_DIR}/${group}/${name.replace(/[^a-zA-Z0-9]+/g, '-')}`;

  if (!fs.existsSync(`${dir}/main.bundle.js`) && (STAGE === 'build' || STAGE === 'all')) {
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(`${dir}/main.js`, code);
    fs.writeFileSync(`${dir}/.babelrc`, JSON.stringify(babelrc || {}, null, 2));
    // Not used in this script, but useful for running Lighthouse manually.
    // Just need to start a web server first.
    fs.writeFileSync(`${dir}/index.html`,
      `<title>${name}</title><script src=main.bundle.min.js></script><p>${name}</p>`);

    // Note: No babelrc will make babel a glorified `cp`.
    runCommand('yarn', [
      'babel',
      `${dir}/main.js`,
      '--config-file', `${dir}/.babelrc`,
      '--ignore', 'node_modules/**/*.js',
      '-o', `${dir}/main.transpiled.js`,
      '--source-maps', 'inline',
    ]);

    // Transform any require statements (like for core-js) into a big bundle.
    runCommand('yarn', [
      'browserify',
      `${dir}/main.transpiled.js`,
      '-o', `${dir}/main.bundle.js`,
      '--debug', // source maps
      '--full-paths=false',
    ]);

    // Minify.
    runCommand('yarn', [
      'terser',
      `${dir}/main.bundle.js`,
      '-o', `${dir}/main.bundle.min.js`,
      '--source-map', 'content="inline",url="main.bundle.min.js.map"',
    ]);
  }

  if (STAGE === 'audit' || STAGE === 'all') {
    const code = fs.readFileSync(`${dir}/main.bundle.min.js`, 'utf-8');
    const map = JSON.parse(fs.readFileSync(`${dir}/main.bundle.min.js.map`, 'utf-8'));

    let legacyJavascriptResults;

    legacyJavascriptResults = await getLegacyJavascriptResults(code, map, {sourceMaps: true});
    fs.writeFileSync(`${dir}/legacy-javascript.json`,
      JSON.stringify(legacyJavascriptResults.items, null, 2));

    legacyJavascriptResults = await getLegacyJavascriptResults(code, map, {sourceMaps: false});
    fs.writeFileSync(`${dir}/legacy-javascript-nomaps.json`,
      JSON.stringify(legacyJavascriptResults.items, null, 2));
  }
}

/**
 * @param {string} code
 * @param {LH.Artifacts.RawSourceMap} map
 * @param {{sourceMaps: boolean}} _
 * @return {Promise<import('../../audits/byte-efficiency/byte-efficiency-audit.js').ByteEfficiencyProduct>}
 */
function getLegacyJavascriptResults(code, map, {sourceMaps}) {
  // Instead of running Lighthouse, use LegacyJavascript directly. Requires some setup.
  // Much faster than running Lighthouse.
  const documentUrl = 'http://localhost/index.html'; // These URLs don't matter.
  const scriptUrl = 'https://localhost/main.bundle.min.js';
  const networkRecords = [
    {url: documentUrl, requestId: '1000.1', resourceType: /** @type {'Document'} */ ('Document')},
    {url: scriptUrl, requestId: '1000.2'},
  ];
  const devtoolsLogs = networkRecordsToDevtoolsLog(networkRecords);

  /** @type {Pick<LH.Artifacts, 'devtoolsLogs'|'URL'|'ScriptElements'|'SourceMaps'>} */
  const artifacts = {
    URL: {finalUrl: documentUrl, requestedUrl: documentUrl},
    devtoolsLogs: {
      [LegacyJavascript.DEFAULT_PASS]: devtoolsLogs,
    },
    ScriptElements: [
      // @ts-expect-error - partial ScriptElement excluding unused DOM properties
      {src: scriptUrl, requestId: '1000.2', content: code},
    ],
    SourceMaps: [],
  };
  if (sourceMaps) artifacts.SourceMaps = [{scriptUrl, map}];
  // @ts-expect-error: partial Artifacts.
  return LegacyJavascript.audit_(artifacts, networkRecords, {
    computedCache: new Map(),
  });
}

/**
 * @param {string} legacyJavascriptFilename
 */
function makeSummary(legacyJavascriptFilename) {
  let totalSignals = 0;
  const variants = [];
  for (const dir of glob.sync('*/*', {cwd: VARIANT_DIR})) {
    /** @type {import('../../audits/byte-efficiency/legacy-javascript.js').Item[]} */
    const legacyJavascriptItems = require(`${VARIANT_DIR}/${dir}/${legacyJavascriptFilename}`);

    const signals = [];
    for (const item of legacyJavascriptItems) {
      for (const subItem of item.subItems.items) {
        signals.push(subItem.signal);
      }
    }
    totalSignals += signals.length;
    variants.push({name: dir, signals: signals.join(', ')});
  }
  return {
    totalSignals,
    variantsMissingSignals: variants.filter(v => !v.signals).map(v => v.name),
    variants,
  };
}

function createSummarySizes() {
  const lines = [];

  for (const variantGroupFolder of glob.sync(`${VARIANT_DIR}/*`)) {
    lines.push(path.relative(VARIANT_DIR, variantGroupFolder));

    const variants = [];
    for (const variantBundle of glob.sync(`${variantGroupFolder}/**/main.bundle.min.js `)) {
      const size = fs.readFileSync(variantBundle).length;
      variants.push({name: path.relative(variantGroupFolder, variantBundle), size});
    }

    const maxNumberChars = Math.ceil(Math.max(...variants.map(v => Math.log10(v.size))));
    variants.sort((a, b) => {
      const sizeDiff = b.size - a.size;
      if (sizeDiff !== 0) return sizeDiff;
      return b.name.localeCompare(a.name);
    });
    for (const variant of variants) {
      // Line up the digits.
      const sizeField = `${variant.size}`.padStart(maxNumberChars);
      // Buffer of 12 characters so a new entry with more digits doesn't change every line.
      lines.push(`  ${sizeField.padEnd(12)} ${variant.name}`);
    }
    lines.push('');
  }

  fs.writeFileSync(`${__dirname}/summary-sizes.txt`, lines.join('\n'));
}

/**
 * @param {string} module
 */
function makeRequireCodeForPolyfill(module) {
  return `require("../../../../node_modules/core-js/modules/${module}")`;
}

async function main() {
  const pluginGroups = [
    ...plugins.map(plugin => [plugin]),
    ['@babel/plugin-transform-regenerator', '@babel/transform-async-to-generator'],
  ];
  for (const pluginGroup of pluginGroups) {
    await createVariant({
      group: 'only-plugin',
      name: pluginGroup.join('_'),
      code: mainCode,
      babelrc: {
        plugins: pluginGroup,
      },
    });
  }

  for (const coreJsVersion of [2, 3]) {
    removeCoreJs();
    installCoreJs(coreJsVersion);

    const moduleOptions = [
      {esmodules: false},
      // Output: https://gist.github.com/connorjclark/515d05094ffd1fc038894a77156bf226
      {esmodules: true},
      {esmodules: true, bugfixes: true},
    ];
    for (const {esmodules, bugfixes} of moduleOptions) {
      await createVariant({
        group: `core-js-${coreJsVersion}-preset-env-esmodules`,
        name: String(esmodules) + (bugfixes ? '_and_bugfixes' : ''),
        code: `require('core-js');\n${mainCode}`,
        babelrc: {
          presets: [
            [
              '@babel/preset-env',
              {
                targets: {esmodules},
                useBuiltIns: 'entry',
                corejs: coreJsVersion,
                bugfixes,
              },
            ],
          ],
        },
      });
    }

    for (const polyfill of polyfills) {
      const module = coreJsVersion === 2 ? polyfill.coreJs2Module : polyfill.coreJs3Module;
      await createVariant({
        group: `core-js-${coreJsVersion}-only-polyfill`,
        name: module,
        code: makeRequireCodeForPolyfill(module),
      });
    }

    const allPolyfillCode = polyfills.map(polyfill => {
      const module = coreJsVersion === 2 ? polyfill.coreJs2Module : polyfill.coreJs3Module;
      return makeRequireCodeForPolyfill(module);
    }).join('\n');
    await createVariant({
      group: 'all-legacy-polyfills',
      name: `all-legacy-polyfills-core-js-${coreJsVersion}`,
      code: allPolyfillCode,
    });
  }

  removeCoreJs();

  let summary;

  // Summary of using source maps and pattern matching.
  summary = makeSummary('legacy-javascript.json');
  fs.writeFileSync(`${__dirname}/summary-signals.json`, JSON.stringify(summary, null, 2));

  // Summary of using only pattern matching.
  summary = makeSummary('legacy-javascript-nomaps.json');
  fs.writeFileSync(`${__dirname}/summary-signals-nomaps.json`, JSON.stringify(summary, null, 2));
  console.log({
    totalSignals: summary.totalSignals,
    variantsMissingSignals: summary.variantsMissingSignals,
  });
  console.table(summary.variants.filter(variant => {
    // Too many signals, break layout.
    if (variant.name.includes('all-legacy-polyfills')) return false;
    return true;
  }));

  createSummarySizes();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

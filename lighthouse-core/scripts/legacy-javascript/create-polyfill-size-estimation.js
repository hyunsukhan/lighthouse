/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-disable no-console */

/**
 * @fileoverview - Used to generate size estimation data for polyfills in LegacyJavaScript audit.
 *
 * Returns a flattened graph of modules found in bundles used for an individual core-js polyfill.
 * See PolyfillSizeEstimator typedef for explanations of the structure of the graph properties
 *
 * USAGE:
 *   1. Run `node run.js`
 *   2. Run `node create-polyfill-size-estimation.js`
 *   3. Inspect `polyfill-graph-data.json`
 */

/**
 * @typedef PolyfillSizeEstimator
 * @property {Record<string, number[]>} dependencies indexed by the polyfill name. array of module indicies
 * @property {number[]} moduleSizes indices in the arrays in `.dependencies` are for this array
 * @property {number} maxSize sum of `.moduleSizes`
 * @property {number} baseSize size of using core-js at all. sum of common modules, and does not show up
 *                             in `.dependencies` or `.moduleSizes`
*/

const fs = require('fs');
const makeHash = require('./hash.js');
const LegacyJavascript = require('../../audits/byte-efficiency/legacy-javascript.js');
const JsBundles = require('../../computed/js-bundles.js');
const prettyJSONStringify = require('pretty-json-stringify');

const hash = makeHash();
const VARIANT_DIR = `${__dirname}/variants/${hash}`;
const OUTPUT_PATH = `${__dirname}/../../audits/byte-efficiency/polyfill-graph-data.json`;

/**
 * @param {number[]} arr
 */
function sum(arr) {
  return arr.reduce((acc, cur) => acc + cur, 0);
}

/**
 * Computes a mapping of polyfill names to their list of dependencies.
 * @return {Map<string, string[]>}
 */
function getPolyfillDependencies() {
  /** @type {Map<string, string[]>} */
  const polyfillDependencies = new Map();

  for (const {name, coreJs3Module} of LegacyJavascript.getPolyfillData()) {
    const folder = coreJs3Module.replace(/[^a-zA-Z0-9]+/g, '-');
    const bundleMapPath =
      `${VARIANT_DIR}/core-js-3-only-polyfill/${folder}/main.bundle.min.js.map`;
    /** @type {LH.Artifacts.RawSourceMap} */
    const bundleMap = JSON.parse(fs.readFileSync(bundleMapPath, 'utf-8'));
    polyfillDependencies.set(name, bundleMap.sources.filter(s => s.startsWith('node_modules')));
  }

  const allPolyfillModules = [...polyfillDependencies.values()];
  const commonModules = allPolyfillModules[0].filter(potentialCommonModule => {
    return allPolyfillModules.every(modules => modules.includes(potentialCommonModule));
  });
  for (const [name, modules] of polyfillDependencies.entries()) {
    polyfillDependencies.set(name, modules.filter(module => !commonModules.includes(module)));
  }
  polyfillDependencies.set('common', commonModules);

  return polyfillDependencies;
}

async function main() {
  const polyfillDependencies = getPolyfillDependencies();

  const bundlePath =
    `${VARIANT_DIR}/all-legacy-polyfills/all-legacy-polyfills-core-js-3/main.bundle.min.js`;
  const bundleContents = fs.readFileSync(bundlePath, 'utf-8');
  const bundleMap = JSON.parse(fs.readFileSync(bundlePath + '.map', 'utf-8'));
  /** @type {Pick<LH.Artifacts, 'ScriptElements'|'SourceMaps'>} */
  const artifacts = {
    // @ts-expect-error don't need most properties on ScriptElement.
    ScriptElements: [{requestId: '', src: '', content: bundleContents}],
    SourceMaps: [{scriptUrl: '', map: bundleMap}],
  };
  const bundles = await JsBundles.compute_(artifacts);
  const bundleFileSizes = bundles[0].sizes.files;

  const allModules = Object.keys(bundleFileSizes).filter(s => s.startsWith('node_modules'));
  const moduleSizes = allModules.map(module => {
    return bundleFileSizes[module];
  });

  /** @type {Record<string, number[]>} */
  const polyfillDependenciesEncoded = {};
  for (const [name, modules] of polyfillDependencies.entries()) {
    if (name === 'common') continue;
    polyfillDependenciesEncoded[name] = modules.map(module => allModules.indexOf(module));
  }

  const maxSize = sum(moduleSizes);
  const baseSize = sum((polyfillDependencies.get('common') || []).map(m => bundleFileSizes[m]));

  /** @type {PolyfillSizeEstimator} */
  const polyfillDependencyGraphData = {
    moduleSizes,
    dependencies: polyfillDependenciesEncoded,
    maxSize,
    baseSize,
  };

  const json = prettyJSONStringify(polyfillDependencyGraphData, {
    tab: '  ',
    spaceBeforeColon: '',
    spaceInsideObject: '',
    shouldExpand: value => !Array.isArray(value),
  });
  fs.writeFileSync(OUTPUT_PATH, json);
}

main();

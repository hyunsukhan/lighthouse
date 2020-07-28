/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit.js');
const TraceOfTab = require('../computed/trace-of-tab.js');
const i18n = require('../lib/i18n/i18n.js');

const UIStrings = {
  /** Title of a diagnostic LH audit that provides details on animations that are not composited. */
  title: 'Avoid non-composited animations',
  /** Description of a diagnostic LH audit that shows the user animations that are not composited. */
  description: 'Animations which are not composited can be janky and contribute to CLS. ' +
    '[Learn more](https://developers.google.com/web/fundamentals/performance/rendering/stick-to-compositor-only-properties-and-manage-layer-count)',
  /** [ICU Syntax] Label identifying the number of animations that are not composited. */
  displayValue: `{itemCount, plural,
  =1 {# animation found}
  other {# animations found}
  }`,
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

/**
 * Each failure reason is represented by a bit flag. The bit shift operator '<<' is used to define which bit corresponds to each failure reason.
 * https://source.chromium.org/chromium/chromium/src/+/master:third_party/blink/renderer/core/animation/compositor_animations.h;l=58;drc=f959aba6099c5d767f885b7f4632955b463dc41d?originalUrl=https:%2F%2Fcs.chromium.org%2F
 * @type {{flag: number, text: string}[]}
 */
const ACTIONABLE_FAILURE_REASONS = [
  {
    flag: 1 << 13,
    text: 'Unsupported CSS Property',
  },
];

/**
 * Return list of actionable failure reasons and a boolean if some reasons are not actionable.
 * Each flag is a number with a single bit set to 1 in the position corresponding to a failure reason.
 * We can check if a specific bit is true in the failure coding using bitwise and '&' with the flag.
 * @param {number} failureCode
 * @return {string[]}
 */
function getActionableFailureReasons(failureCode) {
  /** @type {string[]} */
  const failureReasons = [];
  ACTIONABLE_FAILURE_REASONS.forEach(reason => {
    if (failureCode & reason.flag) {
      failureReasons.push(reason.text);
    }
  });
  return failureReasons;
}

class NonCompositedAnimations extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'non-composited-animations',
      scoreDisplayMode: Audit.SCORING_MODES.INFORMATIVE,
      title: str_(UIStrings.title),
      description: str_(UIStrings.description),
      requiredArtifacts: ['traces', 'TraceElements'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    const trace = artifacts.traces[Audit.DEFAULT_PASS];
    const traceOfTab = await TraceOfTab.request(trace, context);
    const animatedElements = artifacts.TraceElements
      .filter(e => e.traceEventType === 'animation');

    /** @type {Map<string, {begin: LH.TraceEvent | undefined, status: LH.TraceEvent | undefined}>} */
    const animationPairs = new Map();
    for (const event of traceOfTab.mainThreadEvents) {
      if (event.name !== 'Animation') continue;

      if (!event.id2 || !event.id2.local) continue;
      const local = event.id2.local;

      if (!animationPairs.has(local)) {
        animationPairs.set(local, {begin: undefined, status: undefined});
      }

      const pair = animationPairs.get(local);
      if (!pair) continue;
      if (event.ph === 'b') {
        pair.begin = event;
      } else if (event.ph === 'n' && event.args.data && event.args.data.compositeFailed) {
        pair.status = event;
      }
    }

    /** @type Map<LH.Audit.Details.NodeValue, {name?: string, failureReasons: string[]}[]> */
    const elementAnimations = new Map();
    animationPairs.forEach(pair => {
      if (!pair.begin ||
          !pair.begin.args.data ||
          !pair.begin.args.data.nodeId ||
          !pair.begin.args.data.id ||
          !pair.status ||
          !pair.status.args.data ||
          !pair.status.args.data.compositeFailed) return;

      const nodeId = pair.begin.args.data.nodeId;
      const animationId = pair.begin.args.data.id;
      const element = animatedElements.find(e => e.nodeId === nodeId);
      if (!element) return;
      /** @type LH.Audit.Details.NodeValue */
      const node = {
        type: 'node',
        path: element.devtoolsNodePath,
        selector: element.selector,
        nodeLabel: element.nodeLabel,
        snippet: element.snippet,
      };

      const {compositeFailed} = pair.status.args.data;
      const failureReasons = getActionableFailureReasons(compositeFailed);
      if (failureReasons.length === 0) return;

      const animation = element.animations && element.animations.find(a => a.id === animationId);
      const name = animation && animation.name;
      const data = elementAnimations.get(node) || [];
      data.push({name, failureReasons});
      elementAnimations.set(node, data);
    });

    /** @type {LH.Audit.Details.TableItem[]} */
    const results = [];
    elementAnimations.forEach((animations, node) => {
      results.push({
        node,
        subItems: {
          type: 'subitems',
          items: animations.map(({name, failureReasons}) => {
            return {animation: `${name}: ${failureReasons.join(', ')}`};
          }),
        },
      });
    });

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      /* eslint-disable max-len */
      {key: 'node', itemType: 'node', subItemsHeading: {key: 'animation', itemType: 'text'}, text: str_(i18n.UIStrings.columnElement)},
      /* eslint-enable max-len */
    ];

    const details = Audit.makeTableDetails(headings, results);

    let displayValue;
    if (results.length > 0) {
      displayValue = str_(UIStrings.displayValue, {itemCount: results.length});
    }

    return {
      score: results.length === 0 ? 1 : 0,
      notApplicable: results.length === 0,
      details,
      displayValue,
    };
  }
}

module.exports = NonCompositedAnimations;
module.exports.UIStrings = UIStrings;

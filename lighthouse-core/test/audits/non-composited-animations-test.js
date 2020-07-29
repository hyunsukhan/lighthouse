/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const NonCompositedAnimationsAudit =
  require('../../audits/non-composited-animations.js');
const trace = require('../fixtures/traces/animation.json');

/* eslint-env jest */
describe('Non-composited animations audit', () => {
  it('correctly surfaces a non-composited animation', async () => {
    const artifacts = {
      traces: {defaultPass: trace},
      TraceElements: [
        {
          traceEventType: 'animation',
          devtoolsNodePath: '1,HTML,1,BODY,1,DIV',
          selector: 'body > div#animated-boi',
          nodeLabel: 'div',
          snippet: '<div id="animated-boi">',
          nodeId: 4,
          animations: [
            {id: '1', name: 'example'},
          ],
        },
      ],
    };

    const computedCache = new Map();
    const auditResult = await NonCompositedAnimationsAudit.audit(artifacts, {computedCache});
    expect(auditResult.score).toEqual(0);
    expect(auditResult.displayValue).toBeDisplayString('1 animated element found');
    expect(auditResult.details.items).toHaveLength(1);
    expect(auditResult.details.items[0].node).toEqual({
      type: 'node',
      path: '1,HTML,1,BODY,1,DIV',
      selector: 'body > div#animated-boi',
      nodeLabel: 'div',
      snippet: '<div id="animated-boi">',
    });
    expect(auditResult.details.items[0].subItems.items[0]).toEqual({
      animation: 'example',
      failureReasons: 'Unsupported CSS Property',
    });
  });

  it('correctly surfaces unnamed animation', async () => {
    const artifacts = {
      traces: {defaultPass: trace},
      TraceElements: [
        {
          traceEventType: 'animation',
          devtoolsNodePath: '1,HTML,1,BODY,1,DIV',
          selector: 'body > div#animated-boi',
          nodeLabel: 'div',
          snippet: '<div id="animated-boi">',
          nodeId: 4,
          animations: [
            {id: '1'},
          ],
        },
      ],
    };

    const computedCache = new Map();
    const auditResult = await NonCompositedAnimationsAudit.audit(artifacts, {computedCache});
    expect(auditResult.score).toEqual(0);
    expect(auditResult.displayValue).toBeDisplayString('1 animated element found');
    expect(auditResult.details.items).toHaveLength(1);
    expect(auditResult.details.items[0].node).toEqual({
      type: 'node',
      path: '1,HTML,1,BODY,1,DIV',
      selector: 'body > div#animated-boi',
      nodeLabel: 'div',
      snippet: '<div id="animated-boi">',
    });
    expect(auditResult.details.items[0].subItems.items[0]).toEqual({
      animation: '*UNNAMED ANIMATION*', // TODO: Define output for unnamed animation
      failureReasons: 'Unsupported CSS Property'
    })
  });

  it('correctly surfaces node with multiple animations', async () => {
    const artifacts = {
      traces: {defaultPass: trace},
      TraceElements: [
        {
          traceEventType: 'animation',
          devtoolsNodePath: '1,HTML,1,BODY,1,DIV',
          selector: 'body > div#animated-boi',
          nodeLabel: 'div',
          snippet: '<div id="animated-boi">',
          nodeId: 4,
          animations: [
            {id: '1', name: 'alpha'},
            {id: '2', name: 'beta'},
          ],
        },
      ],
    };

    const computedCache = new Map();
    const auditResult = await NonCompositedAnimationsAudit.audit(artifacts, {computedCache});
    expect(auditResult.score).toEqual(0);
    expect(auditResult.displayValue).toBeDisplayString('1 animated element found');
    expect(auditResult.details.items).toHaveLength(1);
    expect(auditResult.details.items[0].node).toEqual({
      type: 'node',
      path: '1,HTML,1,BODY,1,DIV',
      selector: 'body > div#animated-boi',
      nodeLabel: 'div',
      snippet: '<div id="animated-boi">',
    });
    expect(auditResult.details.items[0].subItems.items).toEqual([
      {
        animation: 'alpha',
        failureReasons: 'Unsupported CSS Property',
      },
      {
        animation: 'beta',
        failureReasons: 'Unsupported CSS Property',
      },
    ]);
  });
});

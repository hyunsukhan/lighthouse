/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const NonCompositedAnimationsAudit =
  require('../../audits/non-composited-animations.js');

/* eslint-env jest */
describe('Non-composited animations audit', () => {
  it('correctly surfaces non-composited animations', async () => {
    const artifacts = {
      TraceElements: [
        {
          traceEventType: 'animation',
          devtoolsNodePath: '1,HTML,1,BODY,1,DIV',
          selector: 'body > div#animated-boi',
          nodeLabel: 'div',
          snippet: '<div id="animated-boi">',
          nodeId: 4,
          animations: [
            {failureReasonsMask: 8192},
            {name: 'alpha', failureReasonsMask: 8192},
            {name: 'beta', failureReasonsMask: 8192},
          ],
        },
      ],
      HostUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4216.0 Safari/537.36',
    };

    const auditResult = await NonCompositedAnimationsAudit.audit(artifacts);
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
        failureReason: 'Unsupported CSS Property',
      },
      {
        failureReason: 'Unsupported CSS Property ("alpha")',
      },
      {
        failureReason: 'Unsupported CSS Property ("beta")',
      },
    ]);
  });

  it('does not surface composited animation', async () => {
    const artifacts = {
      TraceElements: [
        {
          traceEventType: 'animation',
          devtoolsNodePath: '1,HTML,1,BODY,1,DIV',
          selector: 'body > div#animated-boi',
          nodeLabel: 'div',
          snippet: '<div id="animated-boi">',
          nodeId: 4,
          animations: [
            {failureReasonsMask: 0},
            {name: 'alpha', failureReasonsMask: 0},
          ],
        },
      ],
      HostUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4216.0 Safari/537.36',
    };

    const auditResult = await NonCompositedAnimationsAudit.audit(artifacts);
    expect(auditResult.score).toEqual(1);
    expect(auditResult.details.items).toHaveLength(0);
  });
});

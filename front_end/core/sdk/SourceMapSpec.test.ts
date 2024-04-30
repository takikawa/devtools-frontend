// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 This file tests if devtools sourcemaps implementation is matching the sourcemaps spec.
 Sourcemap Spec tests are using test data coming from: https://github.com/takikawa/source-map-tests

 At the moment only basic mapping tests are implemented. Expected results:

  ==== FAIL: SourceMapSpec/checks mappings for valid-mapping-null-sources.js.map
  AssertionError: unexpected source URL: expected 'null' to equal null
      at front_end/core/sdk/SourceMapSpec.test.ts:74:20 <- out/Default/gen/front_end/core/sdk/SourceMapSpec.test.js:25:32
      at Array.forEach (<anonymous>)
      at Context.<anonymous> (front_end/core/sdk/SourceMapSpec.test.ts:62:21 <- out/Default/gen/front_end/core/sdk/SourceMapSpec.test.js:21:29)

  - expected
  + actual

  -[null]
  +"null"
  ==============================================================================

  FAILED: 1 failed, 46 passed (0 skipped)
  ERRORS DETECTED

 **/ 

const {assert} = chai;
import type * as Platform from '../platform/platform.js';
import {assertNotNullOrUndefined} from '../platform/platform.js';
import { SourceMapV3, parseSourceMap } from './SourceMap.js';
import * as SDK from './sdk.js';
import {describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';

interface TestSpec {
  name: string;
  description: string;
  baseFile: string;
  sourceMapFile: string;
  sourceMapIsValid: boolean;
  testActions?: TestAction[];
} 

interface TestAction {
  actionType: string;
  generatedLine: number;
  generatedColumn: number;
  originalSource: string;
  originalLine: number;
  originalColumn: number;
  mappedName: null | string;
}

const testCases = await loadTestCasesFromFixture('source-map-spec-tests.json');

describeWithEnvironment.only('SourceMapSpec', async () => {
  testCases.forEach(async ({
    baseFile,
    sourceMapFile,
    testActions,
    sourceMapIsValid
  }) => {
    it(`tests ${sourceMapFile}`, async () => {
      if (!sourceMapIsValid) {
        // TODO - right now most of the failure scenarios are actually passing
        return;
      }
      
      // check if a valid sourcemap can be loaded and a SourceMap object created
      const baseFileUrl = baseFile as Platform.DevToolsPath.UrlString;
      const sourceMapFileUrl = sourceMapFile as Platform.DevToolsPath.UrlString;
      const sourceMapContent = await loadSourceMapFromFixture(sourceMapFile);
      
      assert.doesNotThrow(() => parseSourceMap(JSON.stringify(sourceMapContent)));
      assert.doesNotThrow(() => new SDK.SourceMap.SourceMap(
        baseFileUrl, 
        sourceMapFileUrl, 
        sourceMapContent
      ));
      
      // check if the mappings are valid
      const sourceMap = new SDK.SourceMap.SourceMap(
        baseFileUrl, 
        sourceMapFileUrl, 
        sourceMapContent);
    
      if (testActions !== undefined) {
        testActions.forEach(({
          actionType,
          originalSource,
          originalLine, 
          originalColumn,
          generatedLine,
          generatedColumn
        }) => {
          if (actionType === "checkMapping" && sourceMapIsValid) {
            const actual = sourceMap.findEntry(generatedLine, generatedColumn);
            assertNotNullOrUndefined(actual);
      
            assert.strictEqual(actual.sourceURL, originalSource, 'unexpected source URL');
            assert.strictEqual(actual.sourceLineNumber, originalLine, 'unexpected source line number');
            assert.strictEqual(actual.sourceColumnNumber, originalColumn, 'unexpected source column number');
          }
        });
      }
    }); 
  });
});

async function loadTestCasesFromFixture(filename: string): Promise<TestSpec[]> {
  const testSpec = await getFixtureFileContents<{ tests: TestSpec[] }>(filename);
  return testSpec?.tests ?? [];
};

async function loadSourceMapFromFixture(filename: string): Promise<SourceMapV3> {
  return getFixtureFileContents<SourceMapV3>(filename);
};

async function getFixtureFileContents<T>(filename: string):
    Promise<T> {
  const url = new URL(`/front_end/core/sdk/fixtures/sourcemaps/${filename}`, window.location.origin);

  const response = await fetch(url);

  if (response.status !== 200) {
    throw new Error(`Unable to load ${url}`);
  }

  const contentType = response.headers.get('content-type');
  const isGzipEncoded = contentType !== null && contentType.includes('gzip');
  let buffer = await response.arrayBuffer();

  const decoder = new TextDecoder('utf-8');
  const contents = JSON.parse(decoder.decode(buffer)) as T;
  return contents;
}

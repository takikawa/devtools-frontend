// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 This file tests if devtools sourcemaps implementation is matching the sourcemaps spec.
 Sourcemap Spec tests are using test data coming from: https://github.com/takikawa/source-map-tests

 At the moment only basic mapping tests are implemented. 
 
 There is a lot of warnings of invalid source maps passing the validation - this is up to the authors 
 which ones of these could be actually checked in the SourceMaps implementetion and which ones are ok to ignore.
 
 Expected results:
 
  SUCCESS: 69 passed (0 skipped)

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
  intermediateMaps?:  string[]
}

const testCases = await loadTestCasesFromFixture('source-map-spec-tests.json');

describeWithEnvironment.only('SourceMapSpec', async () => {
  testCases.forEach(async ({
    baseFile,
    sourceMapFile,
    testActions,
    sourceMapIsValid,
    name
  }) => {
    it(`tests ${sourceMapFile}`, async () => {
      const consoleErrorSpy = sinon.spy(console, 'error');
      const sourceMapContent = await loadSourceMapFromFixture(sourceMapFile);

      // 1) check if an invalid sourcemap throws on SourceMap instance creation
      if (!sourceMapIsValid && [
        'sourcesMissing', 
        'indexMapMissingOffset',
        'indexMapWrongTypeSections',
        'indexMapWrongTypeMap',
        'ignoreListWrongType3'
      ].includes(name)) {
        assert.throws(() => new SDK.SourceMap.SourceMap(
          baseFile as Platform.DevToolsPath.UrlString, 
          sourceMapFile as Platform.DevToolsPath.UrlString, 
          sourceMapContent
        ));
        
        return;
      }

      // 2) check if an invalid sourcemap throws on mapping creation
      if (!sourceMapIsValid && [
        'invalidVLQDueToNonBase64Character', 
        'invalidMappingNotAString1',
        'invalidMappingNotAString2',
        'invalidMappingSegmentBadSeparator',
        'invalidMappingSegmentWithZeroFields',
        'invalidMappingSegmentWithTwoFields',
        'invalidMappingSegmentWithThreeFields',
        'invalidVLQDueToMissingContinuationDigits'
      ].includes(name)) {
        const sourceMap = new SDK.SourceMap.SourceMap(
          baseFile as Platform.DevToolsPath.UrlString, 
          sourceMapFile as Platform.DevToolsPath.UrlString, 
          sourceMapContent
        );
        
        // TODO - findEntry or just mappings should be used here? mappings is the culprit 
        // but it is called from different other methods e.g: findEntry()
        sourceMap.mappings();
        assert.equal(consoleErrorSpy.calledWith("Failed to parse source map"), true);

        return;
      }

      // 3) check if an invalid sourcemap can have the mapping created
      if (!sourceMapIsValid) {
        const sourceMap = new SDK.SourceMap.SourceMap(
          baseFile as Platform.DevToolsPath.UrlString, 
          sourceMapFile as Platform.DevToolsPath.UrlString, 
          sourceMapContent
        );
        sourceMap.mappings();
        // TODO - right now most of the failure scenarios are actually passing
        assert.equal(consoleErrorSpy.notCalled, true);
        console.warn(`Invalid sourcemap passes basic validation: ${sourceMapFile}`);
      }

      
      // 4) check if a valid sourcemap can be parsed and a SourceMap instance created
      const baseFileUrl = baseFile as Platform.DevToolsPath.UrlString;
      const sourceMapFileUrl = sourceMapFile as Platform.DevToolsPath.UrlString;
      
      assert.doesNotThrow(() => parseSourceMap(JSON.stringify(sourceMapContent)));
      assert.doesNotThrow(() => new SDK.SourceMap.SourceMap(
        baseFileUrl, 
        sourceMapFileUrl, 
        sourceMapContent
      ));

      
      // 5) check if the mappings are valid
      const sourceMap = new SDK.SourceMap.SourceMap(
        baseFileUrl, 
        sourceMapFileUrl, 
        sourceMapContent);
        
      assert.doesNotThrow(() => sourceMap.findEntry(1, 1));
      
      if (testActions !== undefined) {
        testActions.forEach(async ({
          actionType,
          originalSource,
          originalLine, 
          originalColumn,
          generatedLine,
          generatedColumn,
          intermediateMaps
        }) => {
          
          if (actionType === "checkMapping" && sourceMapIsValid) {
            // 5a) check if the mappings are valid for regular sourcemaps
            // extract to separate function
            let actual = sourceMap.findEntry(generatedLine, generatedColumn);
            assertNotNullOrUndefined(actual);
      
            assert.strictEqual(actual.sourceURL, originalSource, 'unexpected source URL');
            assert.strictEqual(actual.sourceLineNumber, originalLine, 'unexpected source line number');
            assert.strictEqual(actual.sourceColumnNumber, originalColumn, 'unexpected source column number');
          } else if (actionType === "checkMappingTransitive") {
            // 5b) check if the mappings are valid for transative sourcemaps
            // extract to separate function

            assert.strictEqual(Array.isArray(intermediateMaps), true);
            if (!intermediateMaps) {
              return;
            }
            
            let actual = sourceMap.findEntry(generatedLine, generatedColumn);

            for (let intermediateMapPath of intermediateMaps) {
              const intermediereSourceMapContent = await loadSourceMapFromFixture(sourceMapFile); 

              const sourceMap = new SDK.SourceMap.SourceMap(
                baseFileUrl, 
                intermediateMapPath as Platform.DevToolsPath.UrlString,
                intermediereSourceMapContent
              );
              actual = sourceMap.findEntry(generatedLine, generatedColumn);
            }

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

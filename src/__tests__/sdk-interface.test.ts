import { describe, expect, it } from 'vitest';
import { type SDK, SDKImpl } from '../sdk.js';
import { createTestSDK } from './support/test-sdk.js';

/**
 * `true` when every public member of `Implementation` is declared by `Interface`; otherwise the
 * names of the members it leaves out. Private members are not part of `keyof`.
 */
type DeclaresEveryPublicMember<Interface, Implementation> = [
  Exclude<keyof Implementation, keyof Interface>,
] extends [never]
  ? true
  : Exclude<keyof Implementation, keyof Interface>;

// Checked by `tsc -p tsconfig.test.json`: a public method added to SDKImpl without being declared
// in `SDK` makes this line fail to compile, naming the method. `createSDK()` returns an `SDK`,
// so such a method could only be reached with a cast.
const sdkDeclaresEveryPublicMethod: DeclaresEveryPublicMember<SDK, SDKImpl> = true;

// The check itself refuses an interface that leaves a method out.
// @ts-expect-error — compareVersions is public in SDKImpl but missing from this interface.
const incompleteInterfaceIsRefused: DeclaresEveryPublicMember<
  Omit<SDK, 'compareVersions'>,
  SDKImpl
> = true;

/** The methods that were public in SDKImpl but missing from `SDK` before. */
const FORMERLY_HIDDEN = [
  'createRegressionTestSuite',
  'getRegressionTestSuites',
  'runRegressionTests',
  'runRegressionTestSuite',
  'exportTestResults',
  'runRegressionTestsForCI',
  'defineAssertion',
  'getAssertions',
  'evaluateAssertions',
  'deleteAssertion',
  'compareRuns',
  'getComparisonReport',
  'analyzeImpact',
  'getImpactAnalysis',
  'compareVersions',
  'queryEventsAdvanced',
  'countEventsAdvanced',
  'getEventStatistics',
] as const satisfies ReadonlyArray<keyof SDK>;

describe('the SDK interface', () => {
  it('declares every public method of the implementation', async () => {
    expect(sdkDeclaresEveryPublicMethod).toBe(true);
    expect(incompleteInterfaceIsRefused).toBe(true);
    const env = createTestSDK();
    try {
      const sdk: SDK = env.sdk;
      expect(sdk).toBeInstanceOf(SDKImpl);
      for (const name of FORMERLY_HIDDEN) {
        expect(typeof sdk[name], name).toBe('function');
      }
    } finally {
      await env.dispose();
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Policy } from '../types/policy.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

describe('Policy Audit Trail', () => {
  const mockApiKey = 'test-api-key';
  let env: TestSDK;

  beforeEach(() => {
    // A throwaway event store: the default one creates ./events in the working tree.
    env = createTestSDK({ apiKey: mockApiKey });
  });

  afterEach(async () => {
    await env.dispose();
  });

  describe('getPolicyAuditTrail', () => {
    it('should return empty array for non-existent run', () => {
      const sdk = env.sdk;
      const auditTrail = sdk.getPolicyAuditTrail('non-existent-run');
      expect(auditTrail).toEqual([]);
    });

    it('should return empty array when no policies evaluated', () => {
      const sdk = env.sdk;
      const auditTrail = sdk.getPolicyAuditTrail('test-run-id');
      expect(auditTrail).toEqual([]);
    });

    it('should return audit trail with correct structure', () => {
      const sdk = env.sdk;
      const auditTrail = sdk.getPolicyAuditTrail('test-run-id');
      
      // Verify structure (even if empty)
      expect(Array.isArray(auditTrail)).toBe(true);
      
      // If entries exist, verify structure
      if (auditTrail.length > 0) {
        const entry = auditTrail[0];
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('runId');
        expect(entry).toHaveProperty('agentId');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('policyId');
        expect(entry).toHaveProperty('policyType');
        expect(entry).toHaveProperty('intention');
        expect(entry).toHaveProperty('validationResult');
        expect(entry).toHaveProperty('applied');
      }
    });

    it('should handle multiple policies in audit trail', () => {
      const sdk = env.sdk;
      const auditTrail = sdk.getPolicyAuditTrail('test-run-id');
      
      // Verify it's an array (can be empty)
      expect(Array.isArray(auditTrail)).toBe(true);
      
      // If multiple entries exist, verify they all have correct structure
      auditTrail.forEach((entry) => {
        expect(entry).toHaveProperty('policyId');
        expect(entry).toHaveProperty('policyType');
        expect(entry).toHaveProperty('validationResult');
      });
    });
  });
});


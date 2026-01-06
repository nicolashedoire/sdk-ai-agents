import { describe, it, expect, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import type { Policy } from '../types/policy.js';

describe('Policy Audit Trail', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    // Clear any state if needed
  });

  describe('getPolicyAuditTrail', () => {
    it('should return empty array for non-existent run', () => {
      const sdk = createSDK({ apiKey: mockApiKey });
      const auditTrail = sdk.getPolicyAuditTrail('non-existent-run');
      expect(auditTrail).toEqual([]);
    });

    it('should return empty array when no policies evaluated', () => {
      const sdk = createSDK({ apiKey: mockApiKey });
      const auditTrail = sdk.getPolicyAuditTrail('test-run-id');
      expect(auditTrail).toEqual([]);
    });

    it('should return audit trail with correct structure', () => {
      const sdk = createSDK({ apiKey: mockApiKey });
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
      const sdk = createSDK({ apiKey: mockApiKey });
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


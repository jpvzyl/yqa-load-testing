import { describe, it, expect } from 'vitest';
import { Anonymizer, ParityValidator } from '../replay-engine.js';

describe('Anonymizer', () => {
  describe('anonymize with rules', () => {
    it('redact action removes the field value', () => {
      const anon = new Anonymizer([{ field: 'headers.cookie', action: 'redact' }]);
      const result = anon.anonymize({ headers: { cookie: 'session=abc123' } });
      expect(result.headers.cookie).toBe('[REDACTED]');
    });

    it('hash action produces hex string', () => {
      const anon = new Anonymizer([{ field: 'body.email', action: 'hash', salt: 'test' }]);
      const result = anon.anonymize({ body: { email: 'user@example.com' } });
      expect(result.body.email).toMatch(/^[0-9a-f]{16}$/);
    });

    it('replace_token action produces Bearer token format', () => {
      const anon = new Anonymizer([{ field: 'headers.authorization', action: 'replace_token' }]);
      const result = anon.anonymize({ headers: { authorization: 'Bearer real-token' } });
      expect(result.headers.authorization).toMatch(/^Bearer sarfat-test-token-[0-9a-f]{8}$/);
    });
  });

  describe('generateLuhn', () => {
    it('produces a 19-character formatted number (4-4-4-4 with dashes)', () => {
      const anon = new Anonymizer();
      const card = anon.generateLuhn();
      expect(card).toHaveLength(19);
      expect(card).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    });

    it('passes Luhn checksum validation', () => {
      const anon = new Anonymizer();
      const card = anon.generateLuhn();
      const digits = card.replace(/-/g, '').split('').map(Number);
      expect(digits).toHaveLength(16);

      let sum = 0;
      for (let i = 0; i < 16; i++) {
        let d = digits[15 - i];
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
      }
      expect(sum % 10).toBe(0);
    });
  });

  describe('PII detection', () => {
    it('detects and hashes email addresses', () => {
      const anon = new Anonymizer();
      const result = anon.anonymize({ body: { note: 'Contact user@example.com' } });
      expect(result.body.note).not.toContain('user@example.com');
      expect(result.body.note).toMatch(/\[EMAIL_[0-9a-f]{12}\]/);
    });

    it('detects and hashes SSN patterns', () => {
      const anon = new Anonymizer();
      const result = anon.anonymize({ body: { ssn: '123-45-6789' } });
      expect(result.body.ssn).not.toContain('123-45-6789');
      expect(result.body.ssn).toMatch(/\[SSN_[0-9a-f]{12}\]/);
    });

    it('detects and hashes credit card numbers', () => {
      const anon = new Anonymizer();
      const result = anon.anonymize({ body: { card: '4111 1111 1111 1111' } });
      expect(result.body.card).not.toContain('4111 1111 1111 1111');
      expect(result.body.card).toMatch(/\[CREDIT_CARD_[0-9a-f]{12}\]/);
    });
  });

  describe('getNestedValue', () => {
    const anon = new Anonymizer();

    it('gets top-level value', () => {
      expect(anon.getNestedValue({ name: 'test' }, 'name')).toBe('test');
    });

    it('gets deeply nested value', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(anon.getNestedValue(obj, 'a.b.c')).toBe(42);
    });

    it('returns undefined for missing path', () => {
      expect(anon.getNestedValue({ a: 1 }, 'b.c')).toBeUndefined();
    });
  });
});

describe('ParityValidator', () => {
  const validator = new ParityValidator();

  describe('validateSchema', () => {
    it('passes when schemas match', () => {
      const orig = { id: 1, name: 'test', status: 'ok' };
      const replay = { id: 2, name: 'test2', status: 'ok' };
      const result = validator.validateSchema(orig, replay);
      expect(result.matches).toBe(true);
      expect(result.missing_fields).toHaveLength(0);
    });

    it('fails when replayed response is missing fields', () => {
      const orig = { id: 1, name: 'test', email: 'a@b.com' };
      const replay = { id: 2, name: 'other' };
      const result = validator.validateSchema(orig, replay);
      expect(result.matches).toBe(false);
      expect(result.missing_fields).toContain('email');
    });

    it('reports extra fields without failing', () => {
      const orig = { id: 1 };
      const replay = { id: 2, bonus: true };
      const result = validator.validateSchema(orig, replay);
      expect(result.matches).toBe(true);
      expect(result.extra_fields).toContain('bonus');
    });
  });

  describe('validateCriticalFields', () => {
    it('passes when critical fields match', () => {
      const orig = { status: 200, body: { total: 42 } };
      const replay = { status: 200, body: { total: 42 } };
      const result = validator.validateCriticalFields(orig, replay, ['status', 'body.total']);
      expect(result.matches).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('reports mismatches on critical fields', () => {
      const orig = { status: 200, body: { total: 42 } };
      const replay = { status: 200, body: { total: 99 } };
      const result = validator.validateCriticalFields(orig, replay, ['status', 'body.total']);
      expect(result.matches).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].field).toBe('body.total');
    });
  });

  describe('generateParityReport', () => {
    it('calculates correct parity percentage', () => {
      const results = [
        { matches: true },
        { matches: true },
        { matches: false, reason: 'status divergence' },
        { matches: true },
      ];
      const report = validator.generateParityReport(results);
      expect(report.total_requests).toBe(4);
      expect(report.matching_requests).toBe(3);
      expect(report.divergent_requests).toBe(1);
      expect(report.parity_percent).toBe(75);
    });

    it('handles all-matching results', () => {
      const results = [{ matches: true }, { matches: true }];
      const report = validator.generateParityReport(results);
      expect(report.parity_percent).toBe(100);
    });

    it('handles empty results', () => {
      const report = validator.generateParityReport([]);
      expect(report.total_requests).toBe(0);
      expect(report.parity_percent).toBe(0);
    });
  });
});

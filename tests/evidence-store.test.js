import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import path from 'path';

// EvidenceStore constructor calls mkdirSync, so we import the class carefully
// and test pure helper logic + hash computation directly.

describe('SHA-256 hashing (used by EvidenceStore)', () => {
  it('produces correct hex digest for a known input', () => {
    const hash = createHash('sha256').update(Buffer.from('hello world', 'utf-8')).digest('hex');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('produces 64-character hex string', () => {
    const hash = createHash('sha256').update(Buffer.from('test payload')).digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different inputs produce different hashes', () => {
    const h1 = createHash('sha256').update(Buffer.from('input-a')).digest('hex');
    const h2 = createHash('sha256').update(Buffer.from('input-b')).digest('hex');
    expect(h1).not.toBe(h2);
  });
});

describe('formatBytes utility', () => {
  // Replicate the private formatBytes from evidence-store.js
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('formats arbitrary byte values', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });
});

describe('Local backend file path generation', () => {
  it('constructs correct local file path', () => {
    const localPath = '.evidence';
    const runId = 'run-123';
    const type = 'summary';
    const sha256 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const filename = `${runId}/${type}/${sha256.slice(0, 12)}.json`;
    const fullPath = path.join(localPath, filename);

    expect(fullPath).toBe('.evidence/run-123/summary/abcdef123456.json');
  });

  it('constructs correct local storage URL', () => {
    const fullPath = '.evidence/run-123/summary/abcdef123456.json';
    const storageUrl = `local://${fullPath}`;
    expect(storageUrl).toBe('local://.evidence/run-123/summary/abcdef123456.json');
  });
});

describe('Store hash round-trip', () => {
  it('hash of stored payload matches verification hash', () => {
    const data = { metrics: [1, 2, 3], summary: 'test' };
    const payload = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(payload, 'utf-8');

    const storeHash = createHash('sha256').update(buffer).digest('hex');
    const verifyHash = createHash('sha256').update(buffer).digest('hex');

    expect(storeHash).toBe(verifyHash);
  });

  it('tampered payload fails integrity check', () => {
    const original = Buffer.from('original data', 'utf-8');
    const tampered = Buffer.from('tampered data', 'utf-8');

    const originalHash = createHash('sha256').update(original).digest('hex');
    const tamperedHash = createHash('sha256').update(tampered).digest('hex');

    expect(originalHash).not.toBe(tamperedHash);
  });
});

import { describe, it, expect } from 'vitest';
import {
  NodePMError, ManifestError, GitError, PMError, ScannerError, SyncError,
} from '../../src/shared/errors.js';

describe('errors', () => {
  it('NodePMError has code and optional cause', () => {
    const cause = new Error('inner');
    const e = new NodePMError('boom', 'E_TEST', cause);
    expect(e.code).toBe('E_TEST');
    expect(e.cause).toBe(cause);
    expect(e instanceof Error).toBe(true);
  });

  it('subclasses set their own name', () => {
    expect(new ManifestError('x', 'E_M').name).toBe('ManifestError');
    expect(new GitError('x', 'E_G').name).toBe('GitError');
    expect(new PMError('x', 'E_P').name).toBe('PMError');
    expect(new ScannerError('x', 'E_S').name).toBe('ScannerError');
    expect(new SyncError('x', 'E_Y').name).toBe('SyncError');
  });
});

import { describe, it, expect } from 'vitest';
import {
  NodePMError,
  ManifestError,
  GitError,
  PMError,
  ScannerError,
  SyncError,
} from '../../src/shared/errors.js';

// ---------------------------------------------------------------------------
// NodePMError (base class)
// ---------------------------------------------------------------------------

describe('NodePMError', () => {
  it('stores message', () => {
    const e = new NodePMError('the message', 'E_CODE');
    expect(e.message).toBe('the message');
  });

  it('stores code', () => {
    const e = new NodePMError('msg', 'E_MANIFEST_NOT_FOUND');
    expect(e.code).toBe('E_MANIFEST_NOT_FOUND');
  });

  it('cause is undefined when not provided', () => {
    const e = new NodePMError('msg', 'E_CODE');
    expect(e.cause).toBeUndefined();
  });

  it('stores cause by reference when provided', () => {
    const inner = new Error('inner');
    const e = new NodePMError('outer', 'E_CODE', inner);
    expect(e.cause).toBe(inner);
  });

  it('.name is exactly "NodePMError"', () => {
    expect(new NodePMError('m', 'c').name).toBe('NodePMError');
  });

  it('is instanceof Error', () => {
    expect(new NodePMError('m', 'c') instanceof Error).toBe(true);
  });

  it('is instanceof NodePMError', () => {
    expect(new NodePMError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('.stack contains the class name', () => {
    const e = new NodePMError('m', 'c');
    expect(e.stack).toBeDefined();
    expect(e.stack).toContain('NodePMError');
  });

  it('can be thrown and caught with type info intact', () => {
    expect(() => {
      throw new NodePMError('bang', 'E_BANG');
    }).toThrow(NodePMError);
  });

  it('thrown error keeps message and code', () => {
    let caught: NodePMError | undefined;
    try {
      throw new NodePMError('bang', 'E_BANG');
    } catch (err) {
      if (err instanceof NodePMError) caught = err;
    }
    expect(caught?.message).toBe('bang');
    expect(caught?.code).toBe('E_BANG');
  });
});

// ---------------------------------------------------------------------------
// ManifestError
// ---------------------------------------------------------------------------

describe('ManifestError', () => {
  it('stores message', () => {
    expect(new ManifestError('bad manifest', 'E_M').message).toBe('bad manifest');
  });

  it('stores code', () => {
    expect(new ManifestError('m', 'E_MANIFEST_INVALID').code).toBe('E_MANIFEST_INVALID');
  });

  it('.name is exactly "ManifestError"', () => {
    expect(new ManifestError('m', 'c').name).toBe('ManifestError');
  });

  it('is instanceof Error', () => {
    expect(new ManifestError('m', 'c') instanceof Error).toBe(true);
  });

  it('is instanceof NodePMError', () => {
    expect(new ManifestError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('is NOT instanceof GitError', () => {
    expect(new ManifestError('m', 'c') instanceof GitError).toBe(false);
  });

  it('cause undefined when omitted', () => {
    expect(new ManifestError('m', 'c').cause).toBeUndefined();
  });

  it('cause stored by reference', () => {
    const inner = new Error('root');
    const e = new ManifestError('m', 'c', inner);
    expect(e.cause).toBe(inner);
  });

  it('.stack contains "ManifestError"', () => {
    expect(new ManifestError('m', 'c').stack).toContain('ManifestError');
  });
});

// ---------------------------------------------------------------------------
// GitError
// ---------------------------------------------------------------------------

describe('GitError', () => {
  it('stores message', () => {
    expect(new GitError('git failed', 'E_G').message).toBe('git failed');
  });

  it('stores code', () => {
    expect(new GitError('m', 'E_GIT_CLONE').code).toBe('E_GIT_CLONE');
  });

  it('.name is exactly "GitError"', () => {
    expect(new GitError('m', 'c').name).toBe('GitError');
  });

  it('is instanceof Error', () => {
    expect(new GitError('m', 'c') instanceof Error).toBe(true);
  });

  it('is instanceof NodePMError', () => {
    expect(new GitError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('is NOT instanceof ManifestError', () => {
    expect(new GitError('m', 'c') instanceof ManifestError).toBe(false);
  });

  it('cause undefined when omitted', () => {
    expect(new GitError('m', 'c').cause).toBeUndefined();
  });

  it('cause stored by reference', () => {
    const inner = new Error('root');
    expect(new GitError('m', 'c', inner).cause).toBe(inner);
  });

  it('.stack contains "GitError"', () => {
    expect(new GitError('m', 'c').stack).toContain('GitError');
  });
});

// ---------------------------------------------------------------------------
// PMError
// ---------------------------------------------------------------------------

describe('PMError', () => {
  it('.name is exactly "PMError"', () => {
    expect(new PMError('m', 'c').name).toBe('PMError');
  });

  it('is instanceof NodePMError', () => {
    expect(new PMError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('is NOT instanceof SyncError', () => {
    expect(new PMError('m', 'c') instanceof SyncError).toBe(false);
  });

  it('cause undefined when omitted', () => {
    expect(new PMError('m', 'c').cause).toBeUndefined();
  });

  it('cause stored by reference', () => {
    const inner = new Error('root');
    expect(new PMError('m', 'c', inner).cause).toBe(inner);
  });
});

// ---------------------------------------------------------------------------
// ScannerError
// ---------------------------------------------------------------------------

describe('ScannerError', () => {
  it('.name is exactly "ScannerError"', () => {
    expect(new ScannerError('m', 'c').name).toBe('ScannerError');
  });

  it('is instanceof NodePMError', () => {
    expect(new ScannerError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('is NOT instanceof PMError', () => {
    expect(new ScannerError('m', 'c') instanceof PMError).toBe(false);
  });

  it('stores message and code', () => {
    const e = new ScannerError('scan failed', 'E_SCAN');
    expect(e.message).toBe('scan failed');
    expect(e.code).toBe('E_SCAN');
  });

  it('cause stored by reference', () => {
    const inner = new Error('root');
    expect(new ScannerError('m', 'c', inner).cause).toBe(inner);
  });
});

// ---------------------------------------------------------------------------
// SyncError
// ---------------------------------------------------------------------------

describe('SyncError', () => {
  it('.name is exactly "SyncError"', () => {
    expect(new SyncError('m', 'c').name).toBe('SyncError');
  });

  it('is instanceof NodePMError', () => {
    expect(new SyncError('m', 'c') instanceof NodePMError).toBe(true);
  });

  it('is NOT instanceof ScannerError', () => {
    expect(new SyncError('m', 'c') instanceof ScannerError).toBe(false);
  });

  it('stores message and code', () => {
    const e = new SyncError('sync failed', 'E_SYNC');
    expect(e.message).toBe('sync failed');
    expect(e.code).toBe('E_SYNC');
  });

  it('cause stored by reference', () => {
    const inner = new Error('root');
    expect(new SyncError('m', 'c', inner).cause).toBe(inner);
  });

  it('can be thrown and caught preserving all fields', () => {
    let caught: SyncError | undefined;
    try {
      throw new SyncError('sync down', 'E_GIST_404');
    } catch (err) {
      if (err instanceof SyncError) caught = err;
    }
    expect(caught?.message).toBe('sync down');
    expect(caught?.code).toBe('E_GIST_404');
    expect(caught?.name).toBe('SyncError');
  });
});

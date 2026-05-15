export class NodePMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'NodePMError';
  }
}

export class ManifestError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'ManifestError';
  }
}

export class GitError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'GitError';
  }
}

export class PMError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'PMError';
  }
}

export class ScannerError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'ScannerError';
  }
}

export class SyncError extends NodePMError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'SyncError';
  }
}

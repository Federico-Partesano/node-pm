import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BulkCloneForm, type ParsedEntry } from '../../src/tui/components/BulkCloneForm.js';
import { GitOps } from '../../src/core/git.js';

const URLS = [
  'https://github.com/Federico-Partesano/node-pm-test-alpha.git',
  'https://github.com/Federico-Partesano/node-pm-test-beta.git',
  'https://github.com/Federico-Partesano/node-pm-test-gamma.git',
  'https://github.com/Federico-Partesano/node-pm-test-delta.git',
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function typeText(stdin: NodeJS.WritableStream, text: string) {
  for (const ch of text) {
    stdin.write(ch);
    await wait(5);
  }
}

describe('Bulk clone — TUI end-to-end with real GitHub repos', () => {
  it('drives BulkCloneForm via keystrokes, then clones each URL to disk', async () => {
    let received: ParsedEntry[] = [];
    const { stdin, lastFrame, unmount } = render(
      <BulkCloneForm
        defaultGroup="temp-test"
        onSubmit={(entries) => { received = entries; }}
        onCancel={() => {}}
      />,
    );

    await wait(60);
    // Type each URL + Enter
    for (const url of URLS) {
      await typeText(stdin, url);
      stdin.write('\r'); // Enter
      await wait(40);
    }
    const queuedFrame = lastFrame() ?? '';
    expect(queuedFrame).toContain('URLs queued (4)');
    for (const url of URLS) expect(queuedFrame).toContain(url);

    // Ctrl+D submits
    stdin.write('\x04');
    await wait(50);
    unmount();

    expect(received).toHaveLength(4);
    expect(received.map((e) => e.name).sort()).toEqual([
      'node-pm-test-alpha',
      'node-pm-test-beta',
      'node-pm-test-delta',
      'node-pm-test-gamma',
    ]);
    expect(received.every((e) => e.group === 'temp-test')).toBe(true);

    // Now actually clone with GitOps (same path the App.handleBulkClone takes)
    const root = mkdtempSync(path.join(tmpdir(), 'node-pm-bulk-'));
    try {
      const git = new GitOps();
      for (const entry of received) {
        const dest = path.join(root, entry.group, entry.name);
        for await (const _ of git.clone(entry.url, dest)) { /* drain progress */ }
        expect(existsSync(path.join(dest, '.git'))).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

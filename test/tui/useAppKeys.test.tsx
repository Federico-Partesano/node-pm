import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';

// Mock useApp and useInput from ink
const mockExit = vi.fn();
let capturedInputHandler: ((input: string, key: Record<string, boolean>) => void) | null = null;

vi.mock('ink', async (importActual) => {
  const actual = await importActual() as Record<string, unknown>;
  return {
    ...actual,
    useApp: () => ({ exit: mockExit }),
    useInput: (handler: (input: string, key: Record<string, boolean>) => void) => {
      capturedInputHandler = handler;
    },
  };
});

import { useAppKeys } from '../../src/tui/hooks/useAppKeys.js';

function makeArgs(overrides: Partial<Parameters<typeof useAppKeys>[0]> = {}): Parameters<typeof useAppKeys>[0] {
  return {
    enabled: true,
    onTab: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onPull: vi.fn(),
    onClone: vi.fn(),
    onInstall: vi.fn(),
    onRun: vi.fn(),
    ...overrides,
  };
}

function Harness({ args }: { args: Parameters<typeof useAppKeys>[0] }) {
  useAppKeys(args);
  return null;
}

function press(input: string, keyOverrides: Partial<Record<string, boolean>> = {}) {
  if (!capturedInputHandler) throw new Error('No input handler registered');
  capturedInputHandler(input, { tab: false, ...keyOverrides });
}

beforeEach(() => {
  mockExit.mockClear();
  capturedInputHandler = null;
});

describe('useAppKeys', () => {
  it('registers an input handler on mount', () => {
    const args = makeArgs();
    render(<Harness args={args} />);
    expect(capturedInputHandler).not.toBeNull();
  });

  it("'q' calls useApp().exit", () => {
    const args = makeArgs();
    render(<Harness args={args} />);
    press('q');
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it('tab key calls onTab', () => {
    const args = makeArgs();
    render(<Harness args={args} />);
    press('', { tab: true });
    expect(args.onTab).toHaveBeenCalledTimes(1);
  });

  it("'a' calls onSelectAll", () => {
    const args = makeArgs();
    render(<Harness args={args} />);
    press('a');
    expect(args.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("'A' calls onClearSelection", () => {
    const args = makeArgs();
    render(<Harness args={args} />);
    press('A');
    expect(args.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("enabled=true: 'p' calls onPull", () => {
    const args = makeArgs({ enabled: true });
    render(<Harness args={args} />);
    press('p');
    expect(args.onPull).toHaveBeenCalledTimes(1);
  });

  it("enabled=true: 'c' calls onClone", () => {
    const args = makeArgs({ enabled: true });
    render(<Harness args={args} />);
    press('c');
    expect(args.onClone).toHaveBeenCalledTimes(1);
  });

  it("enabled=true: 'i' calls onInstall", () => {
    const args = makeArgs({ enabled: true });
    render(<Harness args={args} />);
    press('i');
    expect(args.onInstall).toHaveBeenCalledTimes(1);
  });

  it("enabled=true: 'r' calls onRun", () => {
    const args = makeArgs({ enabled: true });
    render(<Harness args={args} />);
    press('r');
    expect(args.onRun).toHaveBeenCalledTimes(1);
  });

  it("enabled=false: 'p' does not call onPull", () => {
    const args = makeArgs({ enabled: false });
    render(<Harness args={args} />);
    press('p');
    expect(args.onPull).not.toHaveBeenCalled();
  });

  it("enabled=false: 'c' does not call onClone", () => {
    const args = makeArgs({ enabled: false });
    render(<Harness args={args} />);
    press('c');
    expect(args.onClone).not.toHaveBeenCalled();
  });

  it("enabled=false: 'i' does not call onInstall", () => {
    const args = makeArgs({ enabled: false });
    render(<Harness args={args} />);
    press('i');
    expect(args.onInstall).not.toHaveBeenCalled();
  });

  it("enabled=false: 'r' does not call onRun", () => {
    const args = makeArgs({ enabled: false });
    render(<Harness args={args} />);
    press('r');
    expect(args.onRun).not.toHaveBeenCalled();
  });

  it("enabled=false: 'q' still exits", () => {
    const args = makeArgs({ enabled: false });
    render(<Harness args={args} />);
    press('q');
    expect(mockExit).toHaveBeenCalledTimes(1);
  });
});

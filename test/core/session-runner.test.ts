import { describe, it, expect } from 'vitest';
import { SessionRunner, RingBuffer, type SessionEvent } from '../../src/core/session-runner.js';
import type { Session } from '../../src/shared/types.js';

async function collect(
  runner: SessionRunner,
  session: Session,
  signal?: AbortSignal,
): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  for await (const ev of runner.run(session, { signal })) events.push(ev);
  return events;
}

describe('RingBuffer', () => {
  it('keeps last N items', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 0; i < 10; i++) buf.push(i);
    expect(buf.toArray()).toEqual([7, 8, 9]);
    expect(buf.length).toBe(3);
  });

  it('rejects non-positive cap', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });
});

describe('SessionRunner', () => {
  it('emits start, line, exit, all-done for a successful echo', async () => {
    const runner = new SessionRunner({ resolveProjectPath: () => process.cwd() });
    const session: Session = {
      id: 'echo',
      label: 'Echo',
      terminals: [{ name: 'one', projectRef: 'x/y', cmd: 'echo hello' }],
    };
    const events = await collect(runner, session);
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds).toContain('line');
    const line = events.find((e) => e.kind === 'line');
    expect(line && line.kind === 'line' && line.text).toBe('hello');
    expect(kinds.includes('exit')).toBe(true);
    expect(kinds.at(-1)).toBe('all-done');
  });

  it('captures stderr and non-zero exit', async () => {
    const runner = new SessionRunner({ resolveProjectPath: () => process.cwd() });
    const session: Session = {
      id: 'boom',
      label: 'Boom',
      terminals: [
        {
          name: 't',
          projectRef: 'x/y',
          cmd: `node -e "process.stderr.write('boom\\n'); process.exit(7)"`,
        },
      ],
    };
    const events = await collect(runner, session);
    const errLine = events.find(
      (e) => e.kind === 'line' && e.stream === 'stderr',
    );
    expect(errLine && errLine.kind === 'line' && errLine.text).toBe('boom');
    const exit = events.find((e) => e.kind === 'exit');
    expect(exit && exit.kind === 'exit' && exit.code).toBe(7);
  });

  it('emits error for a non-existent command (no throw)', async () => {
    const runner = new SessionRunner({ resolveProjectPath: () => process.cwd() });
    const session: Session = {
      id: 'nope',
      label: 'Nope',
      terminals: [
        { name: 'missing', projectRef: 'x/y', cmd: '__definitely_not_a_real_binary__' },
      ],
    };
    const events = await collect(runner, session);
    const term = events.find((e) => e.kind === 'error' || e.kind === 'exit');
    // depending on shell behavior, "command not found" can surface either as
    // a non-zero exit (sh: command not found → 127) or as an execa error.
    expect(term).toBeDefined();
    expect(events.at(-1)?.kind).toBe('all-done');
  });

  it('all-done only after every terminal exits', async () => {
    const runner = new SessionRunner({ resolveProjectPath: () => process.cwd() });
    const session: Session = {
      id: 'pair',
      label: 'Pair',
      terminals: [
        { name: 'fast', projectRef: 'x/y', cmd: 'node -e "process.exit(0)"' },
        {
          name: 'slow',
          projectRef: 'x/y',
          cmd: 'node -e "setTimeout(() => process.exit(0), 200)"',
        },
      ],
    };
    const events = await collect(runner, session);
    const exits = events.filter((e) => e.kind === 'exit');
    expect(exits).toHaveLength(2);
    expect(events.at(-1)?.kind).toBe('all-done');
  });

  it('kill produces a killed event for the targeted terminal', async () => {
    const runner = new SessionRunner({
      resolveProjectPath: () => process.cwd(),
      killGraceMs: 50,
    });
    const session: Session = {
      id: 'long',
      label: 'Long',
      terminals: [
        {
          name: 't',
          projectRef: 'x/y',
          cmd: 'node -e "setInterval(() => {}, 1000)"',
        },
      ],
    };
    const events: SessionEvent[] = [];
    const iter = runner.run(session);
    const collector = (async () => {
      for await (const ev of iter) {
        events.push(ev);
        if (ev.kind === 'start') {
          setTimeout(() => void runner.kill('t'), 50);
        }
      }
    })();
    await collector;
    const killed = events.find((e) => e.kind === 'killed');
    expect(killed).toBeDefined();
    expect(events.at(-1)?.kind).toBe('all-done');
  });

  it('respects custom resolveProjectPath for the cwd', async () => {
    const runner = new SessionRunner({
      resolveProjectPath: () => process.cwd(),
    });
    const session: Session = {
      id: 'pwd',
      label: 'pwd',
      terminals: [
        {
          name: 't',
          projectRef: 'x/y',
          cmd: 'node -e "console.log(process.cwd())"',
        },
      ],
    };
    const events = await collect(runner, session);
    const line = events.find((e) => e.kind === 'line');
    expect(line && line.kind === 'line' && line.text).toBe(process.cwd());
  });

  it('buffer(name) exposes ring buffer for a terminal after run', async () => {
    const runner = new SessionRunner({
      resolveProjectPath: () => process.cwd(),
      bufferSize: 3,
    });
    const session: Session = {
      id: 'many',
      label: 'Many',
      terminals: [
        {
          name: 't',
          projectRef: 'x/y',
          cmd: 'node -e "for (let i=0;i<5;i++) console.log(i)"',
        },
      ],
    };
    await collect(runner, session);
    const buf = runner.buffer('t');
    expect(buf.length).toBe(3);
    expect(buf.map((b) => b.text)).toEqual(['2', '3', '4']);
  });
});

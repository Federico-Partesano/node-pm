import React, { useEffect, useRef, useState } from 'react';
import { useInput } from 'ink';
import { ProjectScanner, type ScanEvent } from '../../core/scanner.js';
import { ManifestStore } from '../../core/manifest.js';
import { expandHome } from '../../shared/paths.js';
import type { DiscoveredProject } from '../../shared/types.js';
import { RootStep } from './wizard/RootStep.js';
import { ScanningStep } from './wizard/ScanningStep.js';
import { ReviewStep } from './wizard/ReviewStep.js';
import { SavingStep } from './wizard/SavingStep.js';

type Step = 'root' | 'scanning' | 'review' | 'saving';

type Props = {
  initialRoot: string;
  onComplete: () => void;
  onCancel: () => void;
  scanner?: ProjectScanner;
  store?: ManifestStore;
};

const keyOf = (p: DiscoveredProject) => `${p.group}/${p.name}`;

export function OnboardingWizard({ initialRoot, onComplete, onCancel, scanner, store }: Props) {
  const [step, setStep] = useState<Step>('root');
  const [root, setRoot] = useState(initialRoot);
  const [current, setCurrent] = useState<string>('');
  const [found, setFound] = useState<DiscoveredProject[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewIdx, setReviewIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef(scanner ?? new ProjectScanner());
  const storeRef = useRef(store ?? new ManifestStore());
  const cancelRef = useRef(false);

  useInput((_input, key) => {
    if (!key.escape) return;
    if (step === 'root') onCancel();
    else if (step === 'review') setStep('root');
    else if (step === 'scanning') {
      cancelRef.current = true;
      setStep('root');
    }
  });

  useEffect(() => {
    if (step !== 'scanning') return;
    cancelRef.current = false;
    setFound([]);
    setCurrent('');
    setError(null);
    void runScan(scannerRef.current, expandHome(root), cancelRef, setCurrent, setFound)
      .then((collected) => {
        if (cancelRef.current) return;
        setPicked(new Set(collected.map(keyOf)));
        setReviewIdx(0);
        setStep('review');
      })
      .catch((e: Error) => {
        setError(e.message);
        setStep('root');
      });
  }, [step, root]);

  if (step === 'root') {
    return <RootStep root={root} onChange={setRoot} onSubmit={() => setStep('scanning')} error={error} />;
  }
  if (step === 'scanning') {
    return <ScanningStep root={root} current={current} found={found} />;
  }
  if (step === 'review') {
    return (
      <ReviewStep
        found={found}
        picked={picked}
        cursor={reviewIdx}
        onCursor={setReviewIdx}
        onToggle={(k) => setPicked(togglePick(picked, k))}
        onSelectAll={() => setPicked(new Set(found.map(keyOf)))}
        onClear={() => setPicked(new Set())}
        onConfirm={() => {
          if (picked.size === 0) return;
          setStep('saving');
          void saveAll(storeRef.current, found, picked, root, onComplete);
        }}
        onBack={() => setStep('root')}
      />
    );
  }
  return <SavingStep count={picked.size} />;
}

async function runScan(
  scanner: ProjectScanner,
  root: string,
  cancelRef: React.MutableRefObject<boolean>,
  setCurrent: (s: string) => void,
  setFound: React.Dispatch<React.SetStateAction<DiscoveredProject[]>>,
): Promise<DiscoveredProject[]> {
  const collected: DiscoveredProject[] = [];
  for await (const ev of scanner.scanStream(root)) {
    if (cancelRef.current) break;
    handleEvent(ev, collected, setCurrent, setFound);
  }
  return collected;
}

function handleEvent(
  ev: ScanEvent,
  collected: DiscoveredProject[],
  setCurrent: (s: string) => void,
  setFound: React.Dispatch<React.SetStateAction<DiscoveredProject[]>>,
) {
  if (ev.kind === 'enter-group') setCurrent(ev.path);
  else if (ev.kind === 'enter-repo') setCurrent(ev.path);
  else if (ev.kind === 'found') {
    collected.push(ev.project);
    setFound((prev) => [...prev, ev.project]);
  }
}

function togglePick(set: Set<string>, k: string): Set<string> {
  const next = new Set(set);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  return next;
}

async function saveAll(
  store: ManifestStore,
  found: DiscoveredProject[],
  picked: Set<string>,
  root: string,
  onComplete: () => void,
): Promise<void> {
  const m = await store.load();
  if (m.root !== root) await store.save({ ...m, root });
  for (const p of found) {
    if (picked.has(keyOf(p))) await store.addProject(p);
  }
  onComplete();
}

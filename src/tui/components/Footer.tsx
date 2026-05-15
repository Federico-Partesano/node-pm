import React from 'react';
import { Box, Text } from 'ink';

export type KeyHint = { key: string; label: string };

export const MAIN_HINTS: KeyHint[] = [
  { key: '↑↓/jk', label: 'nav' },
  { key: 'tab', label: 'panel' },
  { key: 'space', label: 'select' },
  { key: 'a/A', label: 'all/clear' },
  { key: 'p', label: 'pull' },
  { key: 'c', label: 'clone' },
  { key: 'i', label: 'install' },
  { key: 'r', label: 'run' },
  { key: 'esc', label: 'home' },
  { key: 'q', label: 'quit' },
];

export const WIZARD_HINTS: KeyHint[] = [
  { key: 'enter', label: 'next' },
  { key: '↑↓/jk', label: 'nav' },
  { key: 'space', label: 'toggle' },
  { key: 'a/A', label: 'all/clear' },
  { key: 'esc', label: 'cancel' },
];

export const FORM_HINTS: KeyHint[] = [
  { key: 'tab', label: 'next field' },
  { key: 'enter', label: 'confirm' },
  { key: 'esc', label: 'cancel' },
];

export const BULK_CLONE_HINTS: KeyHint[] = [
  { key: 'tab', label: 'group/url' },
  { key: 'enter', label: 'add line' },
  { key: 'backspace', label: 'remove last' },
  { key: 'ctrl+d', label: 'submit' },
  { key: 'esc', label: 'cancel' },
];

export const HELP_HINTS: KeyHint[] = [
  { key: 's', label: 'scan wizard' },
  { key: 'n', label: 'new project' },
  { key: 'q', label: 'quit' },
];

type Props = { hints?: KeyHint[] };

export function Footer({ hints = MAIN_HINTS }: Props) {
  return (
    <Box paddingX={2} paddingY={0}>
      {hints.map((h, i) => (
        <Text key={h.key}>
          {i > 0 ? <Text dimColor>  ·  </Text> : null}
          <Text bold color="yellow">{h.key}</Text>
          <Text dimColor> {h.label}</Text>
        </Text>
      ))}
    </Box>
  );
}

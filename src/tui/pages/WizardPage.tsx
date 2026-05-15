import React from 'react';
import { Box } from 'ink';
import { OnboardingWizard } from '../components/OnboardingWizard.js';
import { Footer, WIZARD_HINTS } from '../components/Footer.js';

type Props = {
  width: number;
  height: number;
  initialRoot: string;
  onComplete: () => void;
  onCancel: () => void;
};

export function WizardPage({ width, height, initialRoot, onComplete, onCancel }: Props) {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexGrow={1}>
        <OnboardingWizard
          initialRoot={initialRoot}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      </Box>
      <Footer hints={WIZARD_HINTS} />
    </Box>
  );
}

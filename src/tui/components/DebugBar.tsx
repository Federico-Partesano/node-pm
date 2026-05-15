import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

export function DebugBar() {
  const { isRawModeSupported, stdin } = useStdin();
  const [last, setLast] = useState<string>('—');
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    const tags: string[] = [];
    if (key.upArrow) tags.push('UP');
    if (key.downArrow) tags.push('DOWN');
    if (key.leftArrow) tags.push('LEFT');
    if (key.rightArrow) tags.push('RIGHT');
    if (key.tab) tags.push('TAB');
    if (key.return) tags.push('RETURN');
    if (key.escape) tags.push('ESC');
    if (key.ctrl) tags.push('CTRL');
    if (key.meta) tags.push('META');
    if (key.shift) tags.push('SHIFT');
    const display = tags.length > 0
      ? `${tags.join('+')}${input ? `(${JSON.stringify(input)})` : ''}`
      : JSON.stringify(input);
    setLast(display);
    setCount((c) => c + 1);
  });

  return (
    <Box paddingX={2} borderStyle="single" borderColor="magenta">
      <Text bold color="magenta">DEBUG </Text>
      <Text dimColor>raw=</Text>
      <Text color={isRawModeSupported ? 'green' : 'red'}>
        {isRawModeSupported ? 'YES' : 'NO'}
      </Text>
      <Text dimColor>  tty=</Text>
      <Text color={stdin?.isTTY ? 'green' : 'red'}>
        {stdin?.isTTY ? 'YES' : 'NO'}
      </Text>
      <Text dimColor>  keys=</Text>
      <Text color="cyan">{count}</Text>
      <Text dimColor>  last=</Text>
      <Text color="yellow">{last}</Text>
    </Box>
  );
}

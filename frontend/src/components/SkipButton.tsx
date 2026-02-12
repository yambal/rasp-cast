import { useState } from 'react';
import { Button } from '@chakra-ui/react';
import { skipTrack } from '../api';

interface Props {
  apiKey: string;
  onSkipped?: () => void;
}

export function SkipButton({ apiKey, onSkipped }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      await skipTrack(apiKey);
      onSkipped?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      colorPalette="blue"
      onClick={handleClick}
      loading={loading}
      disabled={!apiKey}
      size="sm"
    >
      Skip
    </Button>
  );
}

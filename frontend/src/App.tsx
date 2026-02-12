import { useState, useEffect } from 'react';
import { Box, Container, Flex, Heading } from '@chakra-ui/react';
import { useStatus } from './hooks/useStatus';
import { usePlaylist } from './hooks/usePlaylist';
import { StatusBar } from './components/StatusBar';
import { NowPlaying } from './components/NowPlaying';
import { ApiKeyInput } from './components/ApiKeyInput';
import { SkipButton } from './components/SkipButton';
import { PlaylistView } from './components/PlaylistView';

const API_KEY_STORAGE = 'rasp-cast-api-key';

export function App() {
  const status = useStatus();
  const { tracks, refresh } = usePlaylist();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey]);

  return (
    <Container maxW="container.sm" py={6}>
      <Heading size="md" mb={4}>Rasp-Cast</Heading>

      <Flex direction="column" gap={5}>
        <StatusBar status={status} />

        <NowPlaying status={status} />

        <Flex gap={3} align="flex-end">
          <Box flex={1}>
            <ApiKeyInput apiKey={apiKey} onChange={setApiKey} />
          </Box>
          <SkipButton apiKey={apiKey} onSkipped={refresh} />
        </Flex>

        <PlaylistView
          tracks={tracks}
          currentTrackId={status?.currentTrack?.id ?? null}
          apiKey={apiKey}
          onSkipped={refresh}
        />
      </Flex>
    </Container>
  );
}

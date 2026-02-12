import { Box, Text, Flex } from '@chakra-ui/react';
import type { Track } from '../types';
import { skipToTrack } from '../api';

interface Props {
  tracks: Track[];
  currentTrackId: string | null;
  apiKey: string;
  onSkipped?: () => void;
}

export function PlaylistView({ tracks, currentTrackId, apiKey, onSkipped }: Props) {
  const handleClick = async (id: string) => {
    if (!apiKey) return;
    try {
      await skipToTrack(apiKey, id);
      onSkipped?.();
    } catch {
      // ignore
    }
  };

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={2}>
        PLAYLIST ({tracks.length} tracks)
      </Text>
      <Flex direction="column" gap={1}>
        {tracks.map((track) => {
          const isCurrent = track.id === currentTrackId;
          return (
            <Flex
              key={track.id}
              align="center"
              px={3}
              py={2}
              borderRadius="md"
              bg={isCurrent ? 'blue.50' : undefined}
              _dark={isCurrent ? { bg: 'blue.900/30' } : undefined}
              cursor={apiKey ? 'pointer' : 'default'}
              _hover={apiKey ? { bg: isCurrent ? 'blue.100' : 'gray.50', _dark: { bg: isCurrent ? 'blue.900/50' : 'gray.800' } } : undefined}
              onClick={() => handleClick(track.id)}
            >
              <Box flex={1} minW={0}>
                <Text
                  fontSize="sm"
                  fontWeight={isCurrent ? 'bold' : 'normal'}
                  truncate
                >
                  {track.title}
                </Text>
                <Text fontSize="xs" color="fg.muted" truncate>
                  {track.artist}
                </Text>
              </Box>
              {isCurrent && (
                <Text fontSize="xs" color="blue.500" fontWeight="bold" ml={2}>
                  NOW
                </Text>
              )}
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
}

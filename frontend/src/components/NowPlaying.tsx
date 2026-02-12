import { Box, Heading, Text } from '@chakra-ui/react';
import type { StatusResponse } from '../types';

interface Props {
  status: StatusResponse | null;
}

export function NowPlaying({ status }: Props) {
  const track = status?.currentTrack;

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={1}>
        NOW PLAYING
      </Text>
      <Heading size="lg">
        {track?.title ?? '---'}
      </Heading>
      <Text color="fg.muted" fontSize="md">
        {track?.artist ?? '---'}
      </Text>
    </Box>
  );
}

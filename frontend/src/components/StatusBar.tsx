import { Badge, Flex, Text } from '@chakra-ui/react';
import type { StatusResponse } from '../types';

interface Props {
  status: StatusResponse | null;
}

export function StatusBar({ status }: Props) {
  if (!status) {
    return (
      <Flex align="center" gap={3}>
        <Badge colorPalette="gray">CONNECTING...</Badge>
      </Flex>
    );
  }

  const badgeColor = status.isPlayingInterrupt
    ? 'orange'
    : status.isStreaming
      ? 'green'
      : 'red';

  const badgeLabel = status.isPlayingInterrupt
    ? 'INTERRUPT'
    : status.isStreaming
      ? 'LIVE'
      : 'OFFLINE';

  return (
    <Flex align="center" gap={3} wrap="wrap">
      <Badge colorPalette={badgeColor} variant="solid" fontSize="sm" px={2} py={1}>
        {badgeLabel}
      </Badge>
      <Text fontSize="sm" color="fg.muted">
        {status.listeners} listener{status.listeners !== 1 ? 's' : ''}
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Track {status.currentIndex + 1} / {status.totalTracks}
      </Text>
      <Text fontSize="xs" color="fg.muted" ml="auto">
        v{status.version}
      </Text>
    </Flex>
  );
}

import { Box, Text, Flex, Badge } from '@chakra-ui/react';
import type { ScheduleProgram } from '../types';

interface Props {
  programs: ScheduleProgram[];
}

export function ScheduleView({ programs }: Props) {
  if (programs.length === 0) return null;

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={2}>
        SCHEDULE ({programs.length})
      </Text>
      <Flex direction="column" gap={1}>
        {programs.map((p) => (
          <Flex
            key={p.id}
            align="center"
            px={3}
            py={2}
            borderRadius="md"
            bg={p.enabled ? undefined : 'gray.50'}
            _dark={p.enabled ? undefined : { bg: 'gray.800' }}
          >
            <Box flex={1} minW={0}>
              <Text fontSize="sm" fontWeight="medium" truncate>
                {p.name}
              </Text>
              <Text fontSize="xs" color="fg.muted" truncate>
                {p.track.title ?? p.track.url ?? p.track.path}
              </Text>
            </Box>
            <Flex align="center" gap={2} ml={2}>
              <Text fontSize="xs" color="fg.muted" fontFamily="mono">
                {p.cron}
              </Text>
              {!p.enabled && (
                <Badge colorPalette="gray" size="sm">OFF</Badge>
              )}
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

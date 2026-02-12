import { Container, Flex, Heading } from '@chakra-ui/react';
import { useStatus } from './hooks/useStatus';
import { useSchedule } from './hooks/useSchedule';
import { StatusBar } from './components/StatusBar';
import { NowPlaying } from './components/NowPlaying';
import { ScheduleView } from './components/ScheduleView';

export function App() {
  const status = useStatus();
  const programs = useSchedule();

  return (
    <Container maxW="container.sm" py={6}>
      <Heading size="md" mb={4}>Rasp-Cast</Heading>

      <Flex direction="column" gap={5}>
        <StatusBar status={status} />

        <NowPlaying status={status} />

        <ScheduleView programs={programs} />
      </Flex>
    </Container>
  );
}

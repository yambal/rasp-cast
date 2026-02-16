import { Box, Container, Flex, Heading, Text, Link } from '@chakra-ui/react';
import { useStatus } from './hooks/useStatus';
import { useSchedule } from './hooks/useSchedule';
import { StatusBar } from './components/StatusBar';
import { NowPlaying } from './components/NowPlaying';
import { ScheduleView } from './components/ScheduleView';
import { HowToListen } from './components/HowToListen';
import { AdminPanel } from './components/AdminPanel';

export function App() {
  // URLパラメータで管理画面を判定
  const isAdmin = new URLSearchParams(window.location.search).has('admin');

  // 管理画面の場合
  if (isAdmin) {
    return <AdminPanel />;
  }

  // 公開ダッシュボード
  const status = useStatus();
  const programs = useSchedule();
  const streamUrl = status?.streamUrl;
  const stationName = status?.stationName || 'YOUR STATION';

  return (
    <Container maxW="container.sm" py={6}>
      <Heading size="md" mb={4}>{stationName}</Heading>

      <Flex direction="column" gap={5}>
        <StatusBar status={status} />

        <NowPlaying status={status} />

        {streamUrl && (
          <Box>
            <audio controls src={streamUrl} style={{ width: '100%' }} />
          </Box>
        )}

        <ScheduleView programs={programs} />

        {streamUrl && <HowToListen streamUrl={streamUrl} stationName={stationName} />}
      </Flex>

      <Box as="footer" mt={8} pt={4} borderTopWidth="1px" borderColor="gray.200">
        <Text fontSize="xs" color="fg.muted">
          Powerd by 
          <Link
            href="https://yambal.github.io/rasp-cast/RASP_CAST"
            target="_blank"
            color="blue.500"
          >
            RASP CAST
          </Link>
        </Text>
      </Box>
    </Container>
  );
}

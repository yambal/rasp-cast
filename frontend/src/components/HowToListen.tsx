import { Box, Text, Code, Link } from '@chakra-ui/react';

interface Props {
  streamUrl: string;
}

export function HowToListen({ streamUrl }: Props) {
  const ets2Line = `stream_data[]: "${streamUrl}|Rasp-Cast|Mixed|JP|128|1"`;

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={2}>
        HOW TO LISTEN
      </Text>

      <Box mb={3}>
        <Text fontSize="xs" color="fg.muted" mb={1}>Stream URL</Text>
        <Code fontSize="xs" px={2} py={1} wordBreak="break-all">
          {streamUrl}
        </Code>
      </Box>

      <Box mb={3}>
        <Text fontSize="xs" color="fg.muted" mb={1}>
          ETS2 / ATS — live_streams.sii に追記
        </Text>
        <Code fontSize="xs" px={2} py={1} display="block" whiteSpace="pre-wrap" wordBreak="break-all">
          {ets2Line}
        </Code>
      </Box>

      <Box>
        <Text fontSize="xs" color="fg.muted" mb={1}>
          ETS2 ラジオ設定ファイル
        </Text>
        <Link
          href="https://yambal.github.io/rasp-cast/RASP_CAST"
          target="_blank"
          fontSize="xs"
          color="blue.500"
        >
          https://yambal.github.io/rasp-cast/RASP_CAST
        </Link>
      </Box>
    </Box>
  );
}

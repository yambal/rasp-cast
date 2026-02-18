import { useEffect, useState } from 'react';
import { Box, Container, Heading, Text, Spinner } from '@chakra-ui/react';

export function ApiDocsPage() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api-docs')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(setContent)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Container maxW="container.md" py={6}>
        <Text color="red.500">API ドキュメントの読み込みに失敗しました: {error}</Text>
      </Container>
    );
  }

  if (content === null) {
    return (
      <Container maxW="container.md" py={6}>
        <Spinner />
      </Container>
    );
  }

  return (
    <Container maxW="container.md" py={6}>
      <Heading size="md" mb={4}>API Reference</Heading>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Machine-readable: <code>GET /api-docs</code> (text/plain)
      </Text>
      <Box
        as="pre"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        fontSize="sm"
        lineHeight="1.7"
        p={4}
        borderWidth="1px"
        borderRadius="md"
        bg="gray.50"
        _dark={{ bg: 'gray.800' }}
        overflowX="auto"
      >
        {content}
      </Box>
    </Container>
  );
}

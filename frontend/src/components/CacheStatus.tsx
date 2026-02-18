import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  VStack,
} from '@chakra-ui/react';

interface CacheFile {
  id: string;
  size: number;
  title?: string;
  artist?: string;
}

interface CacheStatusData {
  files: CacheFile[];
  totalSize: number;
  totalFiles: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CacheStatus() {
  const [cache, setCache] = useState<CacheStatusData | null>(null);

  useEffect(() => {
    let active = true;

    const fetchCache = async () => {
      try {
        const res = await fetch('/cache');
        if (!res.ok) return;
        const data = await res.json();
        if (active) setCache(data);
      } catch {
        // ignore
      }
    };

    fetchCache();
    const interval = setInterval(fetchCache, 30_000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (!cache) return null;

  return (
    <Box mt={6}>
      <Text fontSize="lg" fontWeight="bold" mb={3}>
        キャッシュ ({cache.totalFiles}件 / {formatSize(cache.totalSize)})
      </Text>

      {cache.files.length === 0 ? (
        <Text color="fg.muted">キャッシュファイルはありません</Text>
      ) : (
        <VStack gap={2} align="stretch">
          {cache.files.map((file) => (
            <Flex
              key={file.id}
              p={3}
              borderWidth="1px"
              borderRadius="md"
              justify="space-between"
              align="center"
            >
              <Box flex={1} minW={0}>
                <Text fontWeight="bold" truncate>
                  {file.title || file.id}
                </Text>
                {file.artist && (
                  <Text fontSize="sm" color="fg.muted" truncate>
                    {file.artist}
                  </Text>
                )}
              </Box>
              <Text fontSize="sm" color="fg.muted" flexShrink={0} ml={3}>
                {formatSize(file.size)}
              </Text>
            </Flex>
          ))}
        </VStack>
      )}
    </Box>
  );
}

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  Text,
  Input,
  VStack,
  IconButton,
  Alert,
  Tabs,
  Fieldset,
} from '@chakra-ui/react';
import type { Track } from '../types';
import { useAuth } from '../hooks/useAuth';

export function PlaylistManager() {
  const { apiKey } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // トラック追加フォームの状態
  const [trackType, setTrackType] = useState<'file' | 'url'>('file');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [path, setPath] = useState('');
  const [url, setUrl] = useState('');

  const fetchPlaylist = async () => {
    if (!apiKey) return;

    try {
      const response = await fetch('/playlist', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch playlist');
      const data = await response.json();
      setTracks(data.tracks || []);
      setLoading(false);
    } catch (err) {
      setError('プレイリストの取得に失敗しました');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylist();
  }, [apiKey]);

  const handleAddTrack = async () => {
    if (!title || !artist) {
      setError('タイトルとアーティスト名は必須です');
      return;
    }
    if (trackType === 'file' && !path) {
      setError('ファイルパスは必須です');
      return;
    }
    if (trackType === 'url' && !url) {
      setError('URLは必須です');
      return;
    }

    setError('');
    try {
      const newTrack = {
        type: trackType,
        title,
        artist,
        ...(trackType === 'file' ? { path } : { url }),
      };

      const response = await fetch('/playlist/tracks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(newTrack),
      });

      if (!response.ok) throw new Error('Failed to add track');

      // フォームをリセット
      setTitle('');
      setArtist('');
      setPath('');
      setUrl('');

      // プレイリストを再取得
      await fetchPlaylist();
    } catch (err) {
      setError('トラックの追加に失敗しました');
    }
  };

  const handleDeleteTrack = async (id: string) => {
    if (!confirm('このトラックを削除しますか？')) return;

    try {
      const response = await fetch(`/playlist/tracks/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete track');

      // プレイリストを再取得
      await fetchPlaylist();
    } catch (err) {
      setError('トラックの削除に失敗しました');
    }
  };

  if (loading) {
    return <Text>読み込み中...</Text>;
  }

  return (
    <VStack gap={6} align="stretch">
      {/* エラー表示 */}
      {error && (
        <Alert.Root status="error">
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}

      {/* トラック追加フォーム */}
      <Box p={4} borderWidth="1px" borderRadius="md">
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          トラックを追加
        </Text>

        <Tabs.Root value={trackType} onValueChange={(e) => setTrackType(e.value as 'file' | 'url')}>
          <Tabs.List mb={4}>
            <Tabs.Trigger value="file">ローカルファイル</Tabs.Trigger>
            <Tabs.Trigger value="url">URL</Tabs.Trigger>
          </Tabs.List>

          <VStack gap={3} align="stretch">
            <Fieldset.Root>
              <Fieldset.Legend>タイトル</Fieldset.Legend>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="曲名"
              />
            </Fieldset.Root>

            <Fieldset.Root>
              <Fieldset.Legend>アーティスト</Fieldset.Legend>
              <Input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="アーティスト名"
              />
            </Fieldset.Root>

            <Tabs.Content value="file">
              <Fieldset.Root>
                <Fieldset.Legend>ファイルパス</Fieldset.Legend>
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="music/example.mp3"
                />
                <Fieldset.HelperText>
                  music/ ディレクトリからの相対パス
                </Fieldset.HelperText>
              </Fieldset.Root>
            </Tabs.Content>

            <Tabs.Content value="url">
              <Fieldset.Root>
                <Fieldset.Legend>URL</Fieldset.Legend>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/track.mp3"
                />
                <Fieldset.HelperText>
                  MP3ファイルの直接URL
                </Fieldset.HelperText>
              </Fieldset.Root>
            </Tabs.Content>

            <Button onClick={handleAddTrack} colorScheme="blue">
              追加
            </Button>
          </VStack>
        </Tabs.Root>
      </Box>

      {/* プレイリスト一覧 */}
      <Box>
        <Text fontSize="lg" fontWeight="bold" mb={3}>
          プレイリスト ({tracks.length}曲)
        </Text>

        {tracks.length === 0 ? (
          <Text color="fg.muted">トラックがありません</Text>
        ) : (
          <VStack gap={2} align="stretch">
            {tracks.map((track) => (
              <Flex
                key={track.id}
                p={3}
                borderWidth="1px"
                borderRadius="md"
                justify="space-between"
                align="center"
              >
                <Box flex={1} minW={0}>
                  <Text fontWeight="bold" truncate>
                    {track.title}
                  </Text>
                  <Text fontSize="sm" color="fg.muted" truncate>
                    {track.artist}
                  </Text>
                  <Text fontSize="xs" color="fg.subtle" truncate>
                    {track.type === 'file'
                      ? `📁 ${track.path || track.filename}`
                      : `🌐 ${track.url}`}
                  </Text>
                </Box>

                <IconButton
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => handleDeleteTrack(track.id)}
                  aria-label="Delete track"
                >
                  🗑️
                </IconButton>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>
    </VStack>
  );
}

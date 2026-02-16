import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Text,
  VStack,
  Alert,
} from '@chakra-ui/react';
import { useAuth } from '../hooks/useAuth';
import { PlaylistManager } from './PlaylistManager';

export function AdminPanel() {
  const { isAuthenticated, isVerifying, login, logout } = useAuth();
  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    const success = await login(inputKey);
    if (!success) {
      setError('認証に失敗しました。API_KEYを確認してください。');
      setInputKey('');
    }
  };

  if (!isAuthenticated) {
    return (
      <Container maxW="container.sm" py={12}>
        <VStack gap={6}>
          <Heading size="lg">管理画面</Heading>
          <Text color="fg.muted">
            管理機能を使用するには、API_KEYによる認証が必要です。
          </Text>

          <Box w="full">
            <VStack gap={3}>
              <Input
                type="password"
                placeholder="API_KEY"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                size="lg"
              />
              <Button
                onClick={handleLogin}
                loading={isVerifying}
                size="lg"
                w="full"
                colorScheme="blue"
              >
                ログイン
              </Button>
            </VStack>

            {error && (
              <Alert.Root status="error" mt={3}>
                <Alert.Title>{error}</Alert.Title>
              </Alert.Root>
            )}
          </Box>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => (window.location.href = '/')}
          >
            公開ダッシュボードに戻る
          </Button>
        </VStack>
      </Container>
    );
  }

  return (
    <Container maxW="container.md" py={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="md">プレイリスト管理</Heading>
        <Flex gap={2}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (window.location.href = '/')}
          >
            ダッシュボード
          </Button>
          <Button variant="outline" size="sm" onClick={logout}>
            ログアウト
          </Button>
        </Flex>
      </Flex>

      <PlaylistManager />
    </Container>
  );
}

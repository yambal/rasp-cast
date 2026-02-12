import { Box, Input, Text } from '@chakra-ui/react';

interface Props {
  apiKey: string;
  onChange: (key: string) => void;
}

export function ApiKeyInput({ apiKey, onChange }: Props) {
  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={1}>
        API KEY
      </Text>
      <Input
        type="password"
        placeholder="Enter API key for controls"
        size="sm"
        value={apiKey}
        onChange={(e) => onChange(e.target.value)}
      />
    </Box>
  );
}

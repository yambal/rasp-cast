import { useState, useEffect } from 'react';

const API_KEY_STORAGE_KEY = 'rasp-cast-api-key';

export function useAuth() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // 初回ロード時にlocalStorageからAPI_KEYを取得
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      verifyApiKey(stored);
    }
  }, []);

  const verifyApiKey = async (key: string): Promise<boolean> => {
    setIsVerifying(true);
    try {
      // /playlist エンドポイントで認証をテスト
      // 管理系エンドポイントでAPI_KEYが必要
      const response = await fetch('/playlist', {
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setIsVerifying(false);
        return true;
      } else {
        setIsAuthenticated(false);
        setIsVerifying(false);
        return false;
      }
    } catch (error) {
      console.error('API Key verification failed:', error);
      setIsAuthenticated(false);
      setIsVerifying(false);
      return false;
    }
  };

  const login = async (key: string): Promise<boolean> => {
    const isValid = await verifyApiKey(key);
    if (isValid) {
      setApiKey(key);
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      return true;
    }
    return false;
  };

  const logout = () => {
    setApiKey(null);
    setIsAuthenticated(false);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  };

  return {
    apiKey,
    isAuthenticated,
    isVerifying,
    login,
    logout,
  };
}

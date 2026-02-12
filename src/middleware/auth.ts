import type { Request, Response, NextFunction } from 'express';

const apiKey = process.env.API_KEY || '';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!apiKey) {
    // API_KEY 未設定の場合はすべて許可（開発用）
    next();
    return;
  }

  const auth = req.headers.authorization;
  if (auth === `Bearer ${apiKey}`) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}

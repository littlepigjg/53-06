import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[API Error]', err.message || err);
  const msg = err.message || 'Internal server error';
  if (msg.includes('Unsupported')) return res.status(400).json({ error: msg });
  if (msg.includes('Not found') || msg.includes('Invalid')) return res.status(400).json({ error: msg });
  res.status(500).json({ error: msg });
}

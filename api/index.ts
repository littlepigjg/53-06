import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import documentsRouter from './routes/documents.js';
import shareRouter from './routes/share.js';
import annotationsRouter from './routes/annotations.js';
import reviewRouter from './routes/review.js';
import exportRouter from './routes/export.js';
import { errorHandler } from './middleware/errorHandler.js';
import { FileStorageService } from './services/FileStorageService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const publicDir = path.resolve(__dirname, '..', 'public');

await FileStorageService.ensureDirs();

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/assets', express.static(path.join(distDir, 'assets')));

app.use('/api/documents', documentsRouter);
app.use('/api/share', shareRouter);
app.use('/api/annotations', annotationsRouter);
app.use('/api/review', reviewRouter);
app.use('/api/export', exportRouter);

app.get(['/', '/review/*', '/admin/*'], (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentService } from '../services/DocumentService.js';
import { DocumentParser } from '../services/DocumentParser.js';
import { ShareLinkService } from '../services/ShareLinkService.js';
import { FileStorageService } from '../services/FileStorageService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const docs = await DocumentService.list();
    res.json(docs);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await DocumentService.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/parsed', async (req, res, next) => {
  try {
    const parsed = await DocumentParser.getParsed(req.params.id);
    res.json(parsed);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await DocumentService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const doc = await DocumentService.upload({
      originalname: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
    });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/share', async (req, res, next) => {
  try {
    const token = await ShareLinkService.create(req.params.id);
    res.json({ shareToken: token });
  } catch (e) {
    next(e);
  }
});

export default router;

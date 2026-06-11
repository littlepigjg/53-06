import { Router } from 'express';
import { ExportService } from '../services/ExportService.js';

const router = Router();

router.get('/:docId', async (req, res, next) => {
  try {
    const { filename, content } = await ExportService.toMarkdown(req.params.docId);
    const encoded = encodeURIComponent(filename);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.send(content);
  } catch (e) {
    next(e);
  }
});

export default router;

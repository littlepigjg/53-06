import { Router } from 'express';
import { ShareLinkService } from '../services/ShareLinkService.js';
import { DocumentParser } from '../services/DocumentParser.js';
import { AnnotationService } from '../services/AnnotationService.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const doc = await ShareLinkService.getByToken(req.params.token);
    if (!doc) return res.status(404).json({ error: 'Invalid or expired link' });
    const parsed = await DocumentParser.getParsed(doc.id);
    const annotations = await AnnotationService.list(doc.id);
    res.json({ document: doc, parsed, annotations });
  } catch (e) {
    next(e);
  }
});

export default router;

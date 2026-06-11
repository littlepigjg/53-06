import { Router } from 'express';
import { AnnotationService } from '../services/AnnotationService.js';

const router = Router();

router.get('/:docId', async (req, res, next) => {
  try {
    const list = await AnnotationService.list(req.params.docId);
    res.json(list);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = req.body as {
      docId?: string;
      documentId?: string;
      paragraphId: string;
      type: 'comment' | 'suggestion';
      reviewerName: string;
      reviewerEmail?: string;
      content: string;
      suggestedText?: string;
      originalText?: string;
    };
    const docId = body.docId || body.documentId;
    if (!docId || !body.paragraphId || !body.reviewerName || !body.content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (body.type === 'suggestion' && !body.suggestedText) {
      return res.status(400).json({ error: 'suggestion requires suggestedText' });
    }
    const ann = await AnnotationService.create({ ...body, docId });
    res.json(ann);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, ownerNote } = req.body as { status?: 'pending' | 'accepted' | 'rejected'; ownerNote?: string };
    if (!status || !['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const ann = await AnnotationService.updateStatus(req.params.id, status, ownerNote);
    if (!ann) return res.status(404).json({ error: 'Not found' });
    res.json(ann);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await AnnotationService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

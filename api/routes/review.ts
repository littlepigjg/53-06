import { Router } from 'express';
import { ReviewAggregationService } from '../services/ReviewAggregationService.js';

const router = Router();

router.get('/:docId/summary', async (req, res, next) => {
  try {
    const summary = await ReviewAggregationService.getSummary(req.params.docId);
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

export default router;

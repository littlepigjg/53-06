import type { Annotation, ReviewSummary } from '../../shared/types.js';
import { AnnotationService } from './AnnotationService.js';

export class ReviewAggregationService {
  static async getSummary(docId: string): Promise<ReviewSummary> {
    const anns = await AnnotationService.list(docId);
    const byReviewerMap = new Map<string, number>();
    const byParagraphMap = new Map<string, number>();

    for (const a of anns) {
      byReviewerMap.set(a.reviewerName, (byReviewerMap.get(a.reviewerName) || 0) + 1);
      byParagraphMap.set(a.paragraphId, (byParagraphMap.get(a.paragraphId) || 0) + 1);
    }

    return {
      docId,
      totalAnnotations: anns.length,
      pendingCount: anns.filter((a) => a.status === 'pending').length,
      acceptedCount: anns.filter((a) => a.status === 'accepted').length,
      rejectedCount: anns.filter((a) => a.status === 'rejected').length,
      commentCount: anns.filter((a) => a.type === 'comment').length,
      suggestionCount: anns.filter((a) => a.type === 'suggestion').length,
      byReviewer: Array.from(byReviewerMap.entries()).map(([name, count]) => ({ name, count })),
      byParagraph: Array.from(byParagraphMap.entries()).map(([paragraphId, count]) => ({
        paragraphId,
        count,
      })),
    };
  }
}

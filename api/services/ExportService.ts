import type { Annotation, Paragraph } from '../../shared/types.js';
import { DocumentParser } from './DocumentParser.js';
import { AnnotationService } from './AnnotationService.js';

function applyParagraphSuggestions(paragraph: Paragraph, suggestions: Annotation[]): string {
  const accepted = suggestions.filter(
    (a) => a.type === 'suggestion' && a.status === 'accepted' && a.suggestedText
  );
  if (accepted.length === 0) {
    if (paragraph.type === 'heading') {
      return `${'#'.repeat(paragraph.level || 1)} ${paragraph.content}`;
    }
    if (paragraph.type === 'code' || paragraph.type === 'list' || paragraph.type === 'quote' || paragraph.type === 'table') {
      return paragraph.content;
    }
    return paragraph.content;
  }

  let text = paragraph.content;
  for (const s of accepted) {
    if (s.originalText && text.includes(s.originalText)) {
      text = text.replace(s.originalText, s.suggestedText as string);
    } else {
      text = s.suggestedText as string;
    }
  }

  if (paragraph.type === 'heading') {
    return `${'#'.repeat(paragraph.level || 1)} ${text}`;
  }
  return text;
}

export class ExportService {
  static async toMarkdown(docId: string): Promise<{ filename: string; content: string; title: string }> {
    const parsed = await DocumentParser.getParsed(docId);
    const anns = await AnnotationService.list(docId);

    const byParagraph = new Map<string, Annotation[]>();
    for (const a of anns) {
      const arr = byParagraph.get(a.paragraphId) || [];
      arr.push(a);
      byParagraph.set(a.paragraphId, arr);
    }

    const lines: string[] = [];
    let title = 'document';

    for (const p of parsed.paragraphs) {
      const merged = applyParagraphSuggestions(p, byParagraph.get(p.id) || []);
      if (p.type === 'heading' && (p.level || 1) === 1 && !lines.length) {
        title = p.content;
      }
      lines.push(merged);
      lines.push('');
    }

    return {
      filename: `${title.replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.md`,
      content: lines.join('\n'),
      title,
    };
  }
}

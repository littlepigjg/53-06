import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageSquare } from 'lucide-react';
import type { Paragraph, Annotation } from '../types';
import { useReviewStore } from '../store/reviewStore';

interface DocumentReaderProps {
  paragraphs: Paragraph[];
  annotations: Annotation[];
  interactive?: boolean;
  highlightParagraphId?: string | null;
  onParagraphClick?: (p: Paragraph) => void;
}

export function DocumentReader({
  paragraphs,
  annotations,
  interactive = true,
  highlightParagraphId,
  onParagraphClick,
}: DocumentReaderProps) {
  const selectedId = useReviewStore((s) => s.selectedParagraphId);
  const setSelected = useReviewStore((s) => s.setSelectedParagraphId);

  const annCountByParagraph = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) m.set(a.paragraphId, (m.get(a.paragraphId) || 0) + 1);
    return m;
  }, [annotations]);

  const handleClick = (p: Paragraph) => {
    if (!interactive) return;
    setSelected(p.id);
    onParagraphClick?.(p);
  };

  return (
    <div className="mx-auto max-w-[720px] py-10 px-6">
      {paragraphs.map((p) => {
        const count = annCountByParagraph.get(p.id) || 0;
        const isSelected = selectedId === p.id || highlightParagraphId === p.id;
        return (
          <div
            key={p.id}
            onClick={() => handleClick(p)}
            className={`group relative -mx-2 rounded-lg px-2 py-1.5 transition-colors ${
              interactive ? 'cursor-pointer' : ''
            } ${isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
          >
            <div
              className={`pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full transition-colors ${
                isSelected
                  ? 'bg-amber-500'
                  : count > 0
                  ? 'bg-sky-400 opacity-60'
                  : 'bg-transparent group-hover:bg-slate-200'
              }`}
            />

            <div className="prose prose-slate prose-headings:font-semibold prose-a:text-sky-600 max-w-none font-[Noto_Serif_SC,'Noto Serif SC',serif] leading-[1.9]">
              <ParagraphRenderer paragraph={p} />
            </div>

            {count > 0 && interactive && (
              <div className="absolute -right-1 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-medium text-white shadow-sm">
                <MessageSquare size={10} className="mr-0.5" />
                {count}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ParagraphRenderer({ paragraph }: { paragraph: Paragraph }) {
  const { type, level, content } = paragraph;

  if (type === 'heading') {
    const Tag = (`h${Math.min(level || 1, 6)}`) as keyof JSX.IntrinsicElements;
    const md = content;
    return (
      <Tag>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </Tag>
    );
  }

  if (type === 'code') {
    return (
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
        <code>{content.replace(/^```\w*\n?|\n?```$/g, '')}</code>
      </pre>
    );
  }

  if (type === 'list') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  if (type === 'quote') {
    return (
      <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </blockquote>
    );
  }

  if (type === 'table') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  return (
    <p className="text-[15px] text-slate-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </p>
  );
}

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, AlertCircle, ArrowLeft } from 'lucide-react';
import { shareApi, annotationsApi } from '../utils/api';
import { useReviewStore } from '../store/reviewStore';
import type { DocumentMeta, ParsedDocument, Annotation } from '../types';
import { DocumentReader } from '../components/DocumentReader';
import { ReviewPanel } from '../components/ReviewPanel';

export function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setDocument = useReviewStore((s) => s.setDocument);
  const setParsed = useReviewStore((s) => s.setParsed);
  const setAnnotations = useReviewStore((s) => s.setAnnotations);
  const document = useReviewStore((s) => s.document);
  const parsed = useReviewStore((s) => s.parsed);
  const annotations = useReviewStore((s) => s.annotations);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await shareApi.getReviewData(token);
        if (!alive) return;
        setDocument(data.document);
        setParsed(data.parsed);
        setAnnotations(data.annotations);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message || '加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, setDocument, setParsed, setAnnotations]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">正在加载文档…</div>
      </div>
    );
  }

  if (error || !document || !parsed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle size={24} />
          </div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">无法访问文档</h2>
          <p className="mb-5 text-sm text-slate-500">{error || '链接无效或已过期'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e4e7a]"
          >
            <ArrowLeft size={14} /> 返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
            <FileText size={18} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">{document.title}</h1>
            <p className="text-xs text-slate-500">审阅模式 · 点击段落添加批注</p>
          </div>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft size={14} /> 返回
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 overflow-y-auto bg-[#fafafa]">
          <DocumentReader paragraphs={parsed.paragraphs} annotations={annotations} />
        </main>
        <div className="w-[380px] shrink-0">
          <ReviewPanel paragraphs={parsed.paragraphs} annotations={annotations} />
        </div>
      </div>
    </div>
  );
}

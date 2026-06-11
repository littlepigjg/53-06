import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  ArrowLeft,
  Filter,
  Download,
  Share2,
  Check,
  Users,
  Wand2,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { documentsApi, annotationsApi, reviewApi, exportApi } from '../utils/api';
import type {
  DocumentMeta,
  ParsedDocument,
  Annotation,
  ReviewSummary,
  AnnotationStatus,
  AnnotationType,
  Paragraph,
} from '../types';
import { SummaryStats } from '../components/SummaryStats';
import { AnnotationCard } from '../components/AnnotationCard';
import { DocumentReader } from '../components/DocumentReader';

type FilterStatus = 'all' | AnnotationStatus;
type FilterType = 'all' | AnnotationType;

export function AdminPage() {
  const { docId } = useParams<{ docId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [reviewerFilter, setReviewerFilter] = useState<string>('all');
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAll = async () => {
    if (!docId) return;
    try {
      setLoading(true);
      const [doc, parsedDoc, anns, sum]: [
        DocumentMeta,
        ParsedDocument,
        Annotation[],
        ReviewSummary
      ] = await Promise.all([
        documentsApi.get(docId),
        documentsApi.getParsed(docId),
        annotationsApi.list(docId),
        reviewApi.summary(docId),
      ]);
      setDocMeta(doc);
      setParsed(parsedDoc);
      setAnnotations(anns);
      setSummary(sum);
    } catch (e) {
      setError((e as Error).message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [docId]);

  const filtered = useMemo(() => {
    return annotations.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (reviewerFilter !== 'all' && a.reviewerName !== reviewerFilter) return false;
      if (selectedParagraphId && a.paragraphId !== selectedParagraphId) return false;
      return true;
    });
  }, [annotations, statusFilter, typeFilter, reviewerFilter, selectedParagraphId]);

  const byParagraph = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of annotations) {
      const arr = map.get(a.paragraphId) || [];
      arr.push(a);
      map.set(a.paragraphId, arr);
    }
    return map;
  }, [annotations]);

  const handleStatusChange = async (id: string, status: AnnotationStatus, note?: string) => {
    const updated = await annotationsApi.updateStatus(id, status, note);
    setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    const sum = await reviewApi.summary(docId!);
    setSummary(sum);
  };

  const handleDelete = async (id: string) => {
    await annotationsApi.remove(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    const sum = await reviewApi.summary(docId!);
    setSummary(sum);
  };

  const handleExport = async () => {
    if (!docId) return;
    const { filename, text } = await exportApi.markdown(docId);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyShare = async () => {
    if (!docMeta) return;
    let token = docMeta.shareToken;
    if (!token) {
      const res = await documentsApi.createShare(docMeta.id);
      token = res.shareToken;
      setDocMeta({ ...docMeta, shareToken: token });
    }
    await navigator.clipboard.writeText(`${window.location.origin}/review/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const reviewers = useMemo(() => {
    return Array.from(new Set(annotations.map((a) => a.reviewerName)));
  }, [annotations]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">正在加载…</div>
      </div>
    );
  }

  if (error || !docMeta || !parsed || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">加载失败</h2>
          <p className="mb-5 text-sm text-slate-500">{error || '文档不存在'}</p>
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
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft size={14} />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
              <FileText size={18} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">{docMeta.title}</h1>
              <p className="text-xs text-slate-500">审阅管理后台</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyShare}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? '已复制' : '复制分享链接'}
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1 rounded-md bg-[#1e3a5f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2e4e7a]"
            >
              <Download size={14} /> 导出最终文档
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <SummaryStats summary={summary} />

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-500">筛选：</span>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as FilterStatus)}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'pending', label: '待处理' },
                { value: 'accepted', label: '已接受' },
                { value: 'rejected', label: '已拒绝' },
              ]}
              icon={Clock}
            />
            <Select
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as FilterType)}
              options={[
                { value: 'all', label: '全部类型' },
                { value: 'comment', label: '意见' },
                { value: 'suggestion', label: '建议修改' },
              ]}
              icon={MessageSquare}
            />
            <Select
              value={reviewerFilter}
              onChange={setReviewerFilter}
              options={[
                { value: 'all', label: '全部审阅者' },
                ...reviewers.map((r) => ({ value: r, label: r })),
              ]}
              icon={Users}
            />
            {selectedParagraphId && (
              <button
                onClick={() => setSelectedParagraphId(null)}
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                清除段落筛选
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              显示 {filtered.length} / {annotations.length} 条
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="sticky top-20">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                <Wand2 size={14} className="mr-1 inline align-text-bottom" />
                文档预览（点击筛选段落）
              </h3>
              <div className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <DocumentReader
                  paragraphs={parsed.paragraphs}
                  annotations={annotations}
                  highlightParagraphId={selectedParagraphId}
                  onParagraphClick={(p: Paragraph) =>
                    setSelectedParagraphId((cur) => (cur === p.id ? null : p.id))
                  }
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              <MessageSquare size={14} className="mr-1 inline align-text-bottom" />
              审阅意见列表
            </h3>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <MessageSquare size={32} strokeWidth={1.2} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">暂无符合条件的批注</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((a) => (
                    <div key={a.id}>
                      {(() => {
                        const p = parsed.paragraphs.find((pp) => pp.id === a.paragraphId);
                        return (
                          <>
                            {p && (
                              <button
                                onClick={() =>
                                  setSelectedParagraphId((cur) => (cur === p.id ? null : p.id))
                                }
                                className="mb-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#1e3a5f]"
                              >
                                <FileText size={11} />
                                段落 #{p.index + 1}：{p.content.slice(0, 40)}
                                {p.content.length > 40 ? '…' : ''}
                              </button>
                            )}
                            <AnnotationCard
                              annotation={a}
                              showActions
                              onStatusChange={handleStatusChange}
                              onDelete={handleDelete}
                            />
                          </>
                        );
                      })()}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  icon: Icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ComponentType<any>;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
      {Icon && <Icon size={12 as any} className="text-slate-400" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

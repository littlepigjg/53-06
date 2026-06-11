import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Users,
  MessageSquare,
  Calendar,
  Share2,
  Settings,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { documentsApi } from '../utils/api';
import type { DocumentMeta } from '../types';

interface DocumentListProps {
  documents: DocumentMeta[];
  onDeleted: (id: string) => void;
  onShareGenerated: (id: string, token: string) => void;
}

export function DocumentList({ documents, onDeleted, onShareGenerated }: DocumentListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShare = async (doc: DocumentMeta) => {
    if (doc.shareToken) {
      const url = `${window.location.origin}/review/${doc.shareToken}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(doc.id);
      setTimeout(() => setCopiedId(null), 1500);
      return;
    }
    const { shareToken } = await documentsApi.createShare(doc.id);
    onShareGenerated(doc.id, shareToken);
    const url = `${window.location.origin}/review/${shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该文档及所有批注吗？')) return;
    await documentsApi.remove(id);
    onDeleted(id);
  };

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-slate-300" strokeWidth={1.2} />
        <p className="text-slate-500">暂无文档，上传第一个文档开始审阅协作</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">文档</th>
            <th className="px-5 py-3">格式</th>
            <th className="px-5 py-3">批注</th>
            <th className="px-5 py-3">审阅者</th>
            <th className="px-5 py-3">创建时间</th>
            <th className="px-5 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{doc.title}</p>
                    <p className="text-xs text-slate-500">{doc.originalFileName}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {doc.fileType.toUpperCase()}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                  <MessageSquare size={14} /> {doc.annotationCount}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                  <Users size={14} /> {doc.reviewerCount}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                  <Calendar size={14} />
                  {new Date(doc.createdAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleShare(doc)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-[#1e3a5f]"
                    title="复制分享链接"
                  >
                    {copiedId === doc.id ? <Check size={14} /> : <Share2 size={14} />}
                    <span>{doc.shareToken ? (copiedId === doc.id ? '已复制' : '复制链接') : '生成链接'}</span>
                  </button>
                  <Link
                    to={`/admin/${doc.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-[#1e3a5f]"
                    title="审阅后台"
                  >
                    <Settings size={14} />
                    <span>后台</span>
                  </Link>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Copy size={0} className="hidden" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

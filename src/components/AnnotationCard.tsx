import { useState } from 'react';
import { MessageSquare, Wand2, User, Clock, Check, X, Trash2 } from 'lucide-react';
import type { Annotation, AnnotationStatus } from '../types';

interface AnnotationCardProps {
  annotation: Annotation;
  showActions?: boolean;
  onStatusChange?: (id: string, status: AnnotationStatus, note?: string) => void;
  onDelete?: (id: string) => void;
}

const typeConfig = {
  comment: { label: '意见', icon: MessageSquare, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  suggestion: { label: '建议修改', icon: Wand2, color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const statusConfig = {
  pending: { label: '待处理', color: 'bg-slate-100 text-slate-600' },
  accepted: { label: '已接受', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
};

export function AnnotationCard({ annotation, showActions, onStatusChange, onDelete }: AnnotationCardProps) {
  const TypeIcon = typeConfig[annotation.type].icon;
  const [note, setNote] = useState(annotation.ownerNote || '');
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${typeConfig[annotation.type].color}`}
        >
          <TypeIcon size={12} />
          {typeConfig[annotation.type].label}
        </span>
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusConfig[annotation.status].color}`}>
          {statusConfig[annotation.status].label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          <User size={12} /> {annotation.reviewerName}
        </span>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-slate-800">{annotation.content}</p>

      {annotation.type === 'suggestion' && annotation.originalText && (
        <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">原文</p>
            <p className="text-sm text-red-700 line-through decoration-red-400">{annotation.originalText}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">建议修改为</p>
            <p className="text-sm text-emerald-700">{annotation.suggestedText}</p>
          </div>
        </div>
      )}

      {annotation.type === 'suggestion' && !annotation.originalText && annotation.suggestedText && (
        <div className="mb-3 rounded-lg bg-emerald-50/50 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-600">建议修改为</p>
          <p className="text-sm text-emerald-800">{annotation.suggestedText}</p>
        </div>
      )}

      {annotation.ownerNote && (
        <div className="mb-3 rounded-lg border-l-2 border-[#1e3a5f] bg-[#1e3a5f]/5 px-3 py-2">
          <p className="text-xs font-medium text-[#1e3a5f]">我的备注</p>
          <p className="mt-0.5 text-sm text-slate-700">{annotation.ownerNote}</p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock size={12} />
          {new Date(annotation.createdAt).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>

        {showActions && (
          <div className="flex items-center gap-1">
            {annotation.status === 'pending' && (
              <>
                <button
                  onClick={() => onStatusChange?.(annotation.id, 'accepted', note || undefined)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Check size={12} /> 接受
                </button>
                <button
                  onClick={() => onStatusChange?.(annotation.id, 'rejected', note || undefined)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  <X size={12} /> 拒绝
                </button>
                <button
                  onClick={() => setShowNote((s) => !s)}
                  className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {showNote ? '收起备注' : '备注'}
                </button>
              </>
            )}
            {annotation.status !== 'pending' && (
              <button
                onClick={() => onStatusChange?.(annotation.id, 'pending', note || undefined)}
                className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                撤回处理
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('删除该批注？')) onDelete?.(annotation.id);
              }}
              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {showActions && showNote && (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="添加处理备注（可选）"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

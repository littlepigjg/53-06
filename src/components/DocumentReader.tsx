import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageSquare, Lock, EyeOff, Shield, ArrowDownFromLine, FileText } from 'lucide-react';
import type { Paragraph, Annotation, EffectivePermission } from '../types';
import { useReviewStore } from '../store/reviewStore';
import { usePermissionsFromData } from '../hooks/usePermission';

interface DocumentReaderProps {
  paragraphs: Paragraph[];
  annotations: Annotation[];
  interactive?: boolean;
  highlightParagraphId?: string | null;
  onParagraphClick?: (p: Paragraph) => void;
  docId?: string;
  effectivePermissions?: Record<string, EffectivePermission>;
  showPermissionIndicators?: boolean;
}

interface SectionInfo {
  headingId: string;
  headingLevel: number;
  memberIds: string[];
}

function buildSectionMap(paragraphs: Paragraph[]): Map<string, SectionInfo> {
  const result = new Map<string, SectionInfo>();
  let currentSection: SectionInfo | null = null;
  const sectionStack: SectionInfo[] = [];

  for (const p of paragraphs) {
    if (p.type === 'heading' && p.level != null) {
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].headingLevel >= p.level) {
        sectionStack.pop();
      }
      currentSection = { headingId: p.id, headingLevel: p.level, memberIds: [] };
      sectionStack.push(currentSection);
      result.set(p.id, currentSection);
    } else if (currentSection) {
      currentSection.memberIds.push(p.id);
    }
  }

  return result;
}

function getInheritLabel(inheritedFrom?: string): string | null {
  if (!inheritedFrom) return null;
  if (inheritedFrom === 'document') return '文档默认';
  if (inheritedFrom.startsWith('section:')) {
    const sectionId = inheritedFrom.replace('section:', '');
    return `章节继承 (${sectionId.slice(0, 8)}...)`;
  }
  return inheritedFrom;
}

export function DocumentReader({
  paragraphs,
  annotations,
  interactive = true,
  highlightParagraphId,
  onParagraphClick,
  docId,
  effectivePermissions,
  showPermissionIndicators = false,
}: DocumentReaderProps) {
  const selectedId = useReviewStore((s) => s.selectedParagraphId);
  const setSelected = useReviewStore((s) => s.setSelectedParagraphId);
  const { can, getPermission } = usePermissionsFromData(effectivePermissions);

  const annCountByParagraph = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) m.set(a.paragraphId, (m.get(a.paragraphId) || 0) + 1);
    return m;
  }, [annotations]);

  const sectionMap = useMemo(() => buildSectionMap(paragraphs), [paragraphs]);

  const paragraphToSection = useMemo(() => {
    const m = new Map<string, string>();
    for (const [, section] of sectionMap) {
      for (const mid of section.memberIds) {
        m.set(mid, section.headingId);
      }
    }
    return m;
  }, [sectionMap]);

  const sectionBorderColors = useMemo(() => {
    const colors = ['border-l-indigo-300', 'border-l-emerald-300', 'border-l-amber-300', 'border-l-rose-300', 'border-l-cyan-300', 'border-l-violet-300'];
    const m = new Map<string, string>();
    let idx = 0;
    for (const [headingId] of sectionMap) {
      m.set(headingId, colors[idx % colors.length]);
      idx++;
    }
    return m;
  }, [sectionMap]);

  const handleClick = (p: Paragraph) => {
    if (!interactive) return;
    if (docId && !can(p.id, 'comment')) return;
    setSelected(p.id);
    onParagraphClick?.(p);
  };

  return (
    <div className="mx-auto max-w-[720px] py-10 px-6">
      {paragraphs.map((p) => {
        const count = annCountByParagraph.get(p.id) || 0;
        const isSelected = selectedId === p.id || highlightParagraphId === p.id;
        const perm = docId ? getPermission(p.id) : null;
        const canComment = docId ? can(p.id, 'comment') : true;
        const canAnnotate = docId ? can(p.id, 'annotate') : true;
        const canEdit = docId ? can(p.id, 'edit') : true;

        const isInteractive = interactive && (canComment || canAnnotate || canEdit);
        const isHeading = p.type === 'heading';
        const sectionInfo = isHeading ? sectionMap.get(p.id) : undefined;
        const parentSectionId = paragraphToSection.get(p.id);
        const isInherited = perm?.inheritedFrom && perm.inheritedFrom !== 'direct';
        const isSectionPermission = isHeading && perm?.matchedRules && perm.matchedRules.length > 0;
        const isCascaded = !!perm?.inheritedFrom?.startsWith('section:');
        const inheritLabel = getInheritLabel(perm?.inheritedFrom);

        const sectionBorderColor = parentSectionId
          ? sectionBorderColors.get(parentSectionId)
          : undefined;

        return (
          <div
            key={p.id}
            onClick={() => handleClick(p)}
            className={`group relative -mx-2 rounded-lg px-2 py-1.5 transition-colors ${
              isInteractive ? 'cursor-pointer' : 'cursor-default'
            } ${isSelected ? 'bg-amber-50' : perm?.canRead ? 'hover:bg-slate-50' : 'bg-slate-50 opacity-60'} ${
              !isHeading && sectionBorderColor && showPermissionIndicators ? `border-l-2 ${sectionBorderColor}` : ''
            }`}
          >
            <div
              className={`pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full transition-colors ${
                isSelected
                  ? 'bg-amber-500'
                  : !perm?.canRead
                  ? 'bg-slate-300'
                  : count > 0
                  ? 'bg-sky-400 opacity-60'
                  : 'bg-transparent group-hover:bg-slate-200'
              }`}
            />

            {showPermissionIndicators && perm && (
              <div className="absolute -left-8 top-2 flex flex-col gap-1">
                {!perm.canRead && (
                  <span title="不可见">
                    <EyeOff size={14} className="text-slate-400" />
                  </span>
                )}
                {perm.canRead && !perm.canEdit && !perm.canComment && (
                  <span title="只读">
                    <Lock size={14} className="text-amber-500" />
                  </span>
                )}
                {isHeading && isSectionPermission && (
                  <span title="章节级权限">
                    <Shield size={14} className="text-indigo-500" />
                  </span>
                )}
                {isCascaded && !isHeading && (
                  <span title={`继承自${inheritLabel || '章节'}`}>
                    <ArrowDownFromLine size={14} className="text-blue-400" />
                  </span>
                )}
                {isInherited && !isCascaded && perm.inheritedFrom === 'document' && !isHeading && (
                  <span title="继承自文档默认权限">
                    <FileText size={14} className="text-slate-400" />
                  </span>
                )}
              </div>
            )}

            <div className="prose prose-slate prose-headings:font-semibold prose-a:text-sky-600 max-w-none font-[Noto_Serif_SC,'Noto Serif SC',serif] leading-[1.9]">
              {perm?.canRead ? (
                <>
                  <ParagraphRenderer paragraph={p} />
                  {isHeading && showPermissionIndicators && sectionInfo && sectionInfo.memberIds.length > 0 && (
                    <span className="text-[10px] text-slate-400 ml-2 font-normal">
                      ({sectionInfo.memberIds.length} 个子段落)
                    </span>
                  )}
                </>
              ) : (
                <div className="text-slate-400 italic">
                  <span className="inline-flex items-center gap-1">
                    <Lock size={14} />
                    您没有权限查看此内容
                  </span>
                </div>
              )}
            </div>

            {count > 0 && perm?.canRead && (canComment || canAnnotate) && (
              <div
                className={`absolute -right-1 top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium text-white shadow-sm ${
                  canComment || canAnnotate ? 'bg-sky-500' : 'bg-slate-400'
                }`}
              >
                <MessageSquare size={10} className="mr-0.5" />
                {count}
              </div>
            )}

            {showPermissionIndicators && perm && perm.canRead && (
              <div className="absolute -right-16 top-2 flex flex-col gap-0.5 text-[10px] text-slate-400">
                <div className="flex gap-1">
                  {perm.canEdit && <span className="px-1 bg-green-100 text-green-700 rounded">编辑</span>}
                  {perm.canComment && <span className="px-1 bg-blue-100 text-blue-700 rounded">批注</span>}
                  {perm.isAdmin && <span className="px-1 bg-purple-100 text-purple-700 rounded">管理</span>}
                </div>
                {isInherited && inheritLabel && (
                  <span className="text-[9px] text-slate-400 truncate max-w-[60px]" title={`权限来源: ${inheritLabel}`}>
                    ← {inheritLabel}
                  </span>
                )}
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

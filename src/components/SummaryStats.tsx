import { MessageSquare, Wand2, Clock, CheckCircle2, XCircle, Users } from 'lucide-react';
import type { ReviewSummary } from '../types';

interface SummaryStatsProps {
  summary: ReviewSummary;
}

export function SummaryStats({ summary }: SummaryStatsProps) {
  const cards = [
    {
      label: '批注总数',
      value: summary.totalAnnotations,
      icon: MessageSquare,
      color: 'from-[#1e3a5f] to-[#2e4e7a]',
      textColor: 'text-white',
    },
    {
      label: '待处理',
      value: summary.pendingCount,
      icon: Clock,
      color: 'from-amber-500 to-amber-600',
      textColor: 'text-white',
    },
    {
      label: '已接受',
      value: summary.acceptedCount,
      icon: CheckCircle2,
      color: 'from-emerald-500 to-emerald-600',
      textColor: 'text-white',
    },
    {
      label: '已拒绝',
      value: summary.rejectedCount,
      icon: XCircle,
      color: 'from-red-500 to-red-600',
      textColor: 'text-white',
    },
    {
      label: '建议修改',
      value: summary.suggestionCount,
      icon: Wand2,
      color: 'from-sky-500 to-sky-600',
      textColor: 'text-white',
    },
    {
      label: '审阅者',
      value: summary.byReviewer.length,
      icon: Users,
      color: 'from-slate-600 to-slate-700',
      textColor: 'text-white',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={`rounded-2xl bg-gradient-to-br ${c.color} ${c.textColor} p-4 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs opacity-80">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{c.value}</p>
              </div>
              <Icon size={20} strokeWidth={1.8} className="opacity-80" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

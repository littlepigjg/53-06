import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';
import { documentsApi } from '../utils/api';
import type { DocumentMeta } from '../types';
import { FileUpload } from '../components/FileUpload';
import { DocumentList } from '../components/DocumentList';

export function UploadPage() {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const list = await documentsApi.list();
    setDocs(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleUploaded = (doc: DocumentMeta) => {
    setDocs((prev) => [doc, ...prev]);
  };

  const handleDeleted = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleShareGenerated = (id: string, token: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, shareToken: token } : d)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#1e3a5f]/5">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f] text-white">
              <FileText size={18} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">文档协作审阅</h1>
              <p className="text-xs text-slate-500">Document Review Studio</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="mb-10">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">上传文档</h2>
              <p className="mt-1 text-sm text-slate-500">上传 Word 或 Markdown 文档，生成分享链接邀请审阅者</p>
            </div>
          </div>
          <FileUpload onUploaded={handleUploaded} />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">我的文档</h2>
              <p className="mt-1 text-sm text-slate-500">
                共 {docs.length} 个文档
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
              加载中…
            </div>
          ) : (
            <DocumentList
              documents={docs}
              onDeleted={handleDeleted}
              onShareGenerated={handleShareGenerated}
            />
          )}
        </section>

        <section className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            {
              title: '上传解析',
              desc: '支持 Markdown 与 Word (.docx)，自动拆分为结构化段落',
            },
            {
              title: '逐段批注',
              desc: '审阅者在浏览器中点击段落即可添加意见或建议修改',
            },
            {
              title: '汇总处理',
              desc: '后台查看所有意见，一键接受或拒绝，导出最终文档',
            },
          ].map((x, i) => (
            <div
              key={x.title}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                <span className="text-sm font-semibold">0{i + 1}</span>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-slate-900">{x.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{x.desc}</p>
              <div className="mt-3 inline-flex items-center text-xs text-slate-400 group-hover:text-[#1e3a5f]">
                了解更多 <ArrowRight size={12} className="ml-0.5" />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

import { useCallback, useRef, useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { documentsApi } from '../utils/api';
import type { DocumentMeta } from '../types';

interface FileUploadProps {
  onUploaded: (doc: DocumentMeta) => void;
}

export function FileUpload({ onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const okExt = /\.(md|markdown|docx)$/i.test(file.name);
      if (!okExt) {
        setError('仅支持 .md / .markdown / .docx 文件');
        return;
      }
      setError(null);
      setUploading(true);
      setProgress(10);
      try {
        setProgress(40);
        const doc = await documentsApi.upload(file);
        setProgress(100);
        onUploaded(doc);
      } catch (e) {
        setError((e as Error).message || '上传失败');
      } finally {
        setTimeout(() => {
          setUploading(false);
          setProgress(0);
        }, 400);
      }
    },
    [onUploaded]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        dragOver
          ? 'border-amber-500 bg-amber-50/60'
          : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-amber-100 group-hover:text-amber-700">
        <Upload size={32} strokeWidth={1.5} />
      </div>
      <p className="text-base font-medium text-slate-800">拖拽文件到此处，或点击选择文件</p>
      <p className="mt-2 text-sm text-slate-500">支持 Markdown (.md / .markdown) 与 Word (.docx) 格式</p>

      {uploading && (
        <div className="mx-auto mt-6 w-full max-w-xs">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">正在解析文档…</p>
        </div>
      )}

      {error && (
        <div className="mx-auto mt-4 flex max-w-xs items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
            }}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {progress === 100 && !error && (
        <div className="mx-auto mt-4 flex max-w-xs items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          <span>上传成功</span>
        </div>
      )}
    </div>
  );
}

import type {
  DocumentMeta,
  ParsedDocument,
  Annotation,
  ReviewSummary,
  AnnotationStatus,
} from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const documentsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: form,
    }).then((r) => r.json() as Promise<DocumentMeta>);
  },
  list: () => request<DocumentMeta[]>('/documents'),
  get: (id: string) => request<DocumentMeta>(`/documents/${id}`),
  remove: (id: string) =>
    request<{ ok: true }>(`/documents/${id}`, { method: 'DELETE' }),
  getParsed: (id: string) => request<ParsedDocument>(`/documents/${id}/parsed`),
  createShare: (id: string) =>
    request<{ shareToken: string }>(`/documents/${id}/share`, { method: 'POST' }),
};

export const shareApi = {
  getReviewData: (token: string) =>
    request<{ document: DocumentMeta; parsed: ParsedDocument; annotations: Annotation[] }>(`/share/${token}`),
};

export const annotationsApi = {
  create: (data: {
    documentId: string;
    paragraphId: string;
    type: 'comment' | 'suggestion';
    reviewerName: string;
    reviewerEmail?: string;
    content: string;
    suggestedText?: string;
    originalText?: string;
  }) => request<Annotation>('/annotations', { method: 'POST', body: JSON.stringify(data) }),
  list: (docId: string) => request<Annotation[]>(`/annotations/${docId}`),
  updateStatus: (id: string, status: AnnotationStatus, ownerNote?: string) =>
    request<Annotation>(`/annotations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ownerNote }),
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/annotations/${id}`, { method: 'DELETE' }),
};

export const reviewApi = {
  summary: (docId: string) => request<ReviewSummary>(`/review/${docId}/summary`),
};

export const exportApi = {
  markdown: (docId: string) =>
    fetch(`${API_BASE}/export/${docId}`).then(async (r) => ({
      filename:
        r.headers.get('Content-Disposition')?.match(/filename="?([^"]+)/)?.[1] ||
        'document.md',
      text: await r.text(),
    })),
};

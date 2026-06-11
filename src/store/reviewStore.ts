import { create } from 'zustand';
import type { Annotation, ParsedDocument, DocumentMeta } from '../types';

interface ReviewState {
  document: DocumentMeta | null;
  parsed: ParsedDocument | null;
  annotations: Annotation[];
  selectedParagraphId: string | null;
  reviewerName: string;
  reviewerEmail: string;
  setDocument: (doc: DocumentMeta | null) => void;
  setParsed: (p: ParsedDocument | null) => void;
  setAnnotations: (a: Annotation[]) => void;
  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setSelectedParagraphId: (id: string | null) => void;
  setReviewerName: (n: string) => void;
  setReviewerEmail: (n: string) => void;
  reset: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  document: null,
  parsed: null,
  annotations: [],
  selectedParagraphId: null,
  reviewerName: '',
  reviewerEmail: '',
  setDocument: (doc) => set({ document: doc }),
  setParsed: (p) => set({ parsed: p }),
  setAnnotations: (a) => set({ annotations: a }),
  addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
  updateAnnotation: (a) =>
    set((s) => ({
      annotations: s.annotations.map((x) => (x.id === a.id ? a : x)),
    })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((x) => x.id !== id) })),
  setSelectedParagraphId: (id) => set({ selectedParagraphId: id }),
  setReviewerName: (n) => set({ reviewerName: n }),
  setReviewerEmail: (n) => set({ reviewerEmail: n }),
  reset: () =>
    set({
      document: null,
      parsed: null,
      annotations: [],
      selectedParagraphId: null,
    }),
}));

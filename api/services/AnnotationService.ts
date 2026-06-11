import type { Annotation, AnnotationStatus } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';

function genId() {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AnnotationService {
  static async list(docId: string): Promise<Annotation[]> {
    return FileStorageService.readJson<Annotation[]>(FileStorageService.getAnnotationsPath(docId), []);
  }

  static async create(data: {
    docId: string;
    paragraphId: string;
    type: Annotation['type'];
    reviewerName: string;
    reviewerEmail?: string;
    content: string;
    suggestedText?: string;
    originalText?: string;
  }): Promise<Annotation> {
    const all = await this.list(data.docId);
    const now = new Date().toISOString();
    const ann: Annotation = {
      id: genId(),
      docId: data.docId,
      paragraphId: data.paragraphId,
      type: data.type,
      reviewerName: data.reviewerName,
      reviewerEmail: data.reviewerEmail,
      content: data.content,
      suggestedText: data.suggestedText,
      originalText: data.originalText,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    all.push(ann);
    await FileStorageService.writeJson(FileStorageService.getAnnotationsPath(data.docId), all);
    return ann;
  }

  static async updateStatus(id: string, status: AnnotationStatus, ownerNote?: string): Promise<Annotation | null> {
    const anns = await FileStorageService.readJson<Annotation[]>(
      FileStorageService.getAnnotationsPath('dummy'),
      []
    );
    // Need to search across docs - but let's find by id
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const annDir = path.resolve(__dirname, '..', 'data', 'annotations');
    const files = await fs.readdir(annDir).catch(() => [] as string[]);
    for (const f of files) {
      const fpath = path.join(annDir, f);
      const list = await FileStorageService.readJson<Annotation[]>(fpath, []);
      const idx = list.findIndex((a) => a.id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          status,
          ownerNote,
          updatedAt: new Date().toISOString(),
        };
        await FileStorageService.writeJson(fpath, list);
        return list[idx];
      }
    }
    return null;
  }

  static async remove(id: string): Promise<boolean> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const annDir = path.resolve(__dirname, '..', 'data', 'annotations');
    const files = await fs.readdir(annDir).catch(() => [] as string[]);
    for (const f of files) {
      const fpath = path.join(annDir, f);
      const list = await FileStorageService.readJson<Annotation[]>(fpath, []);
      const filtered = list.filter((a) => a.id !== id);
      if (filtered.length !== list.length) {
        await FileStorageService.writeJson(fpath, filtered);
        return true;
      }
    }
    return false;
  }
}

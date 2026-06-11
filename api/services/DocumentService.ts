import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentMeta, FileType } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import { DocumentParser } from './DocumentParser.js';
import { AnnotationService } from './AnnotationService.js';

function genId() {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class DocumentService {
  static async list(): Promise<DocumentMeta[]> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    const withCounts = await Promise.all(
      docs.map(async (d) => {
        const anns = await AnnotationService.list(d.id);
        const reviewers = new Set(anns.map((a) => a.reviewerName));
        return { ...d, annotationCount: anns.length, reviewerCount: reviewers.size };
      })
    );
    return withCounts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static async get(id: string): Promise<DocumentMeta | null> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    const doc = docs.find((d) => d.id === id) || null;
    if (!doc) return null;
    const anns = await AnnotationService.list(id);
    const reviewers = new Set(anns.map((a) => a.reviewerName));
    return { ...doc, annotationCount: anns.length, reviewerCount: reviewers.size };
  }

  static async upload(file: { originalname: string; path: string; mimetype: string }): Promise<DocumentMeta> {
    const ext = path.extname(file.originalname).toLowerCase();
    let fileType: FileType;
    if (ext === '.md' || ext === '.markdown' || file.mimetype.includes('markdown') || file.mimetype.includes('text')) {
      fileType = 'markdown';
    } else if (ext === '.docx') {
      fileType = 'docx';
    } else {
      throw new Error('Unsupported file type');
    }

    const id = genId();
    const uploadsDir = FileStorageService.getUploadsPath();
    const storedPath = path.join(uploadsDir, `${id}${ext}`);
    await fs.rename(file.path, storedPath);

    const parsedInfo =
      fileType === 'markdown'
        ? await DocumentParser.parseMarkdownFile(storedPath, file.originalname)
        : await DocumentParser.parseDocxFile(storedPath, file.originalname);

    const parsed = await DocumentParser.buildParsedDocument(id, parsedInfo.markdown, fileType);
    await DocumentParser.saveParsed(parsed);

    const now = new Date().toISOString();
    const meta: DocumentMeta = {
      id,
      title: parsedInfo.title,
      originalFileName: file.originalname,
      fileType,
      createdAt: now,
      updatedAt: now,
      annotationCount: 0,
      reviewerCount: 0,
      sharePassword: null,
      shareExpiresAt: null,
    };

    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    docs.push(meta);
    await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);

    return meta;
  }

  static async remove(id: string): Promise<boolean> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    const idx = docs.findIndex((d) => d.id === id);
    if (idx < 0) return false;
    docs.splice(idx, 1);
    await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);

    await FileStorageService.deleteFile(FileStorageService.getAnnotationsPath(id));
    await FileStorageService.deleteFile(FileStorageService.getParsedPath(id));

    const uploadsDir = FileStorageService.getUploadsPath();
    const fs = await import('node:fs/promises');
    const files = await fs.readdir(uploadsDir).catch(() => []);
    for (const f of files) {
      if (f.startsWith(id)) {
        await FileStorageService.deleteFile(path.join(uploadsDir, f));
      }
    }
    return true;
  }
}

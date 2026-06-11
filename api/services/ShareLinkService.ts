import type { DocumentMeta } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';

function genToken() {
  return `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class ShareLinkService {
  static async create(docId: string): Promise<string> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    const idx = docs.findIndex((d) => d.id === docId);
    if (idx < 0) throw new Error('Document not found');
    const token = genToken();
    docs[idx] = { ...docs[idx], shareToken: token, updatedAt: new Date().toISOString() };
    await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);
    return token;
  }

  static async getByToken(token: string): Promise<DocumentMeta | null> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(FileStorageService.getDocumentsPath(), []);
    return docs.find((d) => d.shareToken === token) || null;
  }
}

import type {
  DocumentMeta,
  PermissionSnapshot,
  ShareLinkWithSnapshot,
  UserContext,
} from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import { PermissionService } from './PermissionService.js';
import { AuditLogService } from './AuditLogService.js';

function genToken() {
  return `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class ShareLinkService {
  static async getAll(): Promise<ShareLinkWithSnapshot[]> {
    return FileStorageService.readJson<ShareLinkWithSnapshot[]>(
      FileStorageService.getShareLinksPath(),
      []
    );
  }

  static async getByToken(token: string): Promise<ShareLinkWithSnapshot | null> {
    const links = await this.getAll();
    const link = links.find((l) => l.token === token) || null;

    if (link && link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return null;
    }

    return link;
  }

  static async getByDocId(docId: string): Promise<ShareLinkWithSnapshot[]> {
    const links = await this.getAll();
    return links.filter((l) => l.docId === docId);
  }

  static async create(
    docId: string,
    options: {
      password?: string;
      expiresAt?: string;
      userContext?: UserContext;
      ip?: string;
    } = {}
  ): Promise<ShareLinkWithSnapshot> {
    const docs = await FileStorageService.readJson<DocumentMeta[]>(
      FileStorageService.getDocumentsPath(),
      []
    );
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');

    const docPerm = await PermissionService.getOrCreateDocumentPermission(docId);
    const permissionSnapshot: PermissionSnapshot = {
      documentPermission: JSON.parse(JSON.stringify(docPerm)),
      createdAt: new Date().toISOString(),
    };

    const token = genToken();
    const now = new Date().toISOString();

    const shareLink: ShareLinkWithSnapshot = {
      token,
      docId,
      permissionSnapshot,
      password: options.password || null,
      expiresAt: options.expiresAt || null,
      createdAt: now,
      createdBy: options.userContext?.userId || options.userContext?.email,
    };

    const links = await this.getAll();
    links.push(shareLink);
    await FileStorageService.writeJson(FileStorageService.getShareLinksPath(), links);

    doc.shareToken = token;
    doc.sharePassword = options.password || null;
    doc.shareExpiresAt = options.expiresAt || null;
    doc.updatedAt = now;
    await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);

    await AuditLogService.logShareCreated(
      docId,
      options.userContext || { name: 'system' },
      {
        token,
        hasPassword: !!options.password,
        expiresAt: options.expiresAt,
      },
      options.ip
    );

    return shareLink;
  }

  static async validateAccess(
    token: string,
    password?: string,
    userContext?: UserContext,
    ip?: string,
    userAgent?: string
  ): Promise<{ valid: boolean; link?: ShareLinkWithSnapshot; reason?: string }> {
    const link = await this.getByToken(token);
    if (!link) {
      return { valid: false, reason: 'Invalid or expired link' };
    }

    if (link.password && link.password !== password) {
      await AuditLogService.logShareAccessed(
        link.docId,
        userContext || { name: 'anonymous' },
        { token, success: false, reason: 'wrong_password' },
        ip,
        userAgent
      );
      return { valid: false, reason: 'Invalid password' };
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      await AuditLogService.logShareAccessed(
        link.docId,
        userContext || { name: 'anonymous' },
        { token, success: false, reason: 'expired' },
        ip,
        userAgent
      );
      return { valid: false, reason: 'Link has expired' };
    }

    await AuditLogService.logShareAccessed(
      link.docId,
      userContext || { name: 'anonymous' },
      { token, success: true },
      ip,
      userAgent
    );

    return { valid: true, link };
  }

  static async getPermissionSnapshot(token: string): Promise<PermissionSnapshot | null> {
    const link = await this.getByToken(token);
    return link?.permissionSnapshot || null;
  }

  static async revoke(token: string): Promise<boolean> {
    const links = await this.getAll();
    const idx = links.findIndex((l) => l.token === token);
    if (idx < 0) return false;

    const link = links[idx];
    links.splice(idx, 1);
    await FileStorageService.writeJson(FileStorageService.getShareLinksPath(), links);

    const docs = await FileStorageService.readJson<DocumentMeta[]>(
      FileStorageService.getDocumentsPath(),
      []
    );
    const docIdx = docs.findIndex((d) => d.id === link.docId);
    if (docIdx >= 0) {
      docs[docIdx].shareToken = undefined;
      docs[docIdx].sharePassword = null;
      docs[docIdx].shareExpiresAt = null;
      docs[docIdx].updatedAt = new Date().toISOString();
      await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);
    }

    return true;
  }

  static async revokeByDocId(docId: string): Promise<number> {
    const links = await this.getAll();
    const toRemove = links.filter((l) => l.docId === docId);
    const remaining = links.filter((l) => l.docId !== docId);

    if (toRemove.length > 0) {
      await FileStorageService.writeJson(FileStorageService.getShareLinksPath(), remaining);

      const docs = await FileStorageService.readJson<DocumentMeta[]>(
        FileStorageService.getDocumentsPath(),
        []
      );
      const docIdx = docs.findIndex((d) => d.id === docId);
      if (docIdx >= 0) {
        docs[docIdx].shareToken = undefined;
        docs[docIdx].sharePassword = null;
        docs[docIdx].shareExpiresAt = null;
        docs[docIdx].updatedAt = new Date().toISOString();
        await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);
      }
    }

    return toRemove.length;
  }

  static async updateExpiry(token: string, expiresAt: string | null): Promise<ShareLinkWithSnapshot | null> {
    const links = await this.getAll();
    const idx = links.findIndex((l) => l.token === token);
    if (idx < 0) return null;

    links[idx].expiresAt = expiresAt;
    await FileStorageService.writeJson(FileStorageService.getShareLinksPath(), links);

    const docs = await FileStorageService.readJson<DocumentMeta[]>(
      FileStorageService.getDocumentsPath(),
      []
    );
    const docIdx = docs.findIndex((d) => d.id === links[idx].docId);
    if (docIdx >= 0) {
      docs[docIdx].shareExpiresAt = expiresAt;
      docs[docIdx].updatedAt = new Date().toISOString();
      await FileStorageService.writeJson(FileStorageService.getDocumentsPath(), docs);
    }

    return links[idx];
  }
}

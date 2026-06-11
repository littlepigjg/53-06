import type {
  DocumentPermission,
  ParagraphPermission,
  PermissionRule,
  UserContext,
  EffectivePermission,
  PermissionAction,
  PermissionCacheStats,
  PermissionSnapshotDiff,
  Paragraph,
} from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import {
  matchRule,
  evaluateRules,
  buildSectionMap,
  calculateEffectivePermissionSync,
  calculateAllParagraphPermissionsSync,
  checkPermissionSync,
  hashDocumentPermission,
  getSnapshotCacheKey,
} from '../utils/PermissionCalculator.js';

function genRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  permission: EffectivePermission;
  timestamp: number;
}

const permissionCache = new Map<string, CacheEntry>();
let cacheHitCount = 0;
let cacheMissCount = 0;

function evictCacheIfNeeded() {
  if (permissionCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(permissionCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, permissionCache.size - MAX_CACHE_ENTRIES);
  for (const [key] of toRemove) {
    permissionCache.delete(key);
  }
}

export class PermissionService {
  static matchRule = matchRule;
  static evaluateRules = evaluateRules;
  static buildSectionMap = buildSectionMap;

  static async getDocumentPermission(docId: string): Promise<DocumentPermission | null> {
    const perm = await FileStorageService.readJson<DocumentPermission | null>(
      FileStorageService.getPermissionPath(docId),
      null
    );
    return perm;
  }

  static async getOrCreateDocumentPermission(docId: string): Promise<DocumentPermission> {
    let perm = await this.getDocumentPermission(docId);
    if (!perm) {
      perm = {
        docId,
        defaultRules: [
          {
            id: genRuleId(),
            subjectType: 'everyone',
            subjectValue: '*',
            actions: ['read'],
            priority: 0,
          },
        ],
        paragraphPermissions: [],
        updatedAt: new Date().toISOString(),
      };
      await this.saveDocumentPermission(perm);
    }
    return perm;
  }

  static async saveDocumentPermission(permission: DocumentPermission): Promise<void> {
    permission.updatedAt = new Date().toISOString();
    await FileStorageService.writeJson(FileStorageService.getPermissionPath(permission.docId), permission);
    this.invalidateCache(permission.docId);
  }

  static async setDefaultRules(docId: string, rules: Omit<PermissionRule, 'id'>[]): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    perm.defaultRules = rules.map((r) => ({ ...r, id: genRuleId() }));
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async addDefaultRule(docId: string, rule: Omit<PermissionRule, 'id'>): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    perm.defaultRules.push({ ...rule, id: genRuleId() });
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async removeDefaultRule(docId: string, ruleId: string): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    perm.defaultRules = perm.defaultRules.filter((r) => r.id !== ruleId);
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async setParagraphPermission(
    docId: string,
    paragraphId: string,
    rules: Omit<PermissionRule, 'id'>[],
    inheritFromDocument = true
  ): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    const existingIdx = perm.paragraphPermissions.findIndex((p) => p.paragraphId === paragraphId);
    const paragraphPerm: ParagraphPermission = {
      paragraphId,
      rules: rules.map((r) => ({ ...r, id: genRuleId() })),
      inheritFromDocument,
    };
    if (existingIdx >= 0) {
      paragraphPerm.isSection = perm.paragraphPermissions[existingIdx].isSection;
      paragraphPerm.sectionHeadingLevel = perm.paragraphPermissions[existingIdx].sectionHeadingLevel;
      paragraphPerm.cascadeToChildren = perm.paragraphPermissions[existingIdx].cascadeToChildren;
      perm.paragraphPermissions[existingIdx] = paragraphPerm;
    } else {
      perm.paragraphPermissions.push(paragraphPerm);
    }
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async removeParagraphPermission(docId: string, paragraphId: string): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    perm.paragraphPermissions = perm.paragraphPermissions.filter((p) => p.paragraphId !== paragraphId);
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async setSectionPermission(
    docId: string,
    headingParagraphId: string,
    headingLevel: number,
    rules: Omit<PermissionRule, 'id'>[],
    cascadeToChildren = true,
    inheritFromDocument = true
  ): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    const existingIdx = perm.paragraphPermissions.findIndex((p) => p.paragraphId === headingParagraphId);
    const sectionPerm: ParagraphPermission = {
      paragraphId: headingParagraphId,
      rules: rules.map((r) => ({ ...r, id: genRuleId() })),
      inheritFromDocument,
      isSection: true,
      sectionHeadingLevel: headingLevel,
      cascadeToChildren,
    };
    if (existingIdx >= 0) {
      perm.paragraphPermissions[existingIdx] = sectionPerm;
    } else {
      perm.paragraphPermissions.push(sectionPerm);
    }
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async batchSetParagraphPermissions(
    docId: string,
    items: { paragraphId: string; rules: Omit<PermissionRule, 'id'>[]; inheritFromDocument?: boolean }[]
  ): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    for (const item of items) {
      const existingIdx = perm.paragraphPermissions.findIndex((p) => p.paragraphId === item.paragraphId);
      const pp: ParagraphPermission = {
        paragraphId: item.paragraphId,
        rules: item.rules.map((r) => ({ ...r, id: genRuleId() })),
        inheritFromDocument: item.inheritFromDocument !== false,
      };
      if (existingIdx >= 0) {
        perm.paragraphPermissions[existingIdx] = pp;
      } else {
        perm.paragraphPermissions.push(pp);
      }
    }
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async calculateEffectivePermission(
    docId: string,
    paragraphId: string | 'document',
    userContext: UserContext,
    forceRefresh = false,
    permissionOverride?: DocumentPermission,
    paragraphs?: Paragraph[]
  ): Promise<EffectivePermission> {
    const docPerm = permissionOverride || (await this.getOrCreateDocumentPermission(docId));
    const snapshotHash = permissionOverride ? hashDocumentPermission(permissionOverride) : undefined;
    const cacheKey = getSnapshotCacheKey(docId, paragraphId, userContext, snapshotHash);

    if (!forceRefresh && !permissionOverride) {
      const cached = permissionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        cacheHitCount++;
        return cached.permission;
      }
    }

    cacheMissCount++;

    if (userContext.isAdmin) {
      const perm: EffectivePermission = {
        paragraphId,
        canRead: true,
        canEdit: true,
        canComment: true,
        canAnnotate: true,
        canShare: true,
        isAdmin: true,
        matchedRules: ['admin'],
      };
      if (!permissionOverride) {
        permissionCache.set(cacheKey, { permission: perm, timestamp: Date.now() });
        evictCacheIfNeeded();
      }
      return perm;
    }

    const perm = calculateEffectivePermissionSync({
      docId,
      paragraphId,
      userContext,
      docPerm,
      paragraphs,
    });

    if (!permissionOverride) {
      permissionCache.set(cacheKey, { permission: perm, timestamp: Date.now() });
      evictCacheIfNeeded();
    }

    return perm;
  }

  static async calculateAllParagraphPermissions(
    docId: string,
    paragraphIds: string[],
    userContext: UserContext,
    permissionOverride?: DocumentPermission,
    paragraphs?: Paragraph[]
  ): Promise<Map<string, EffectivePermission>> {
    const docPerm = permissionOverride || (await this.getOrCreateDocumentPermission(docId));
    return calculateAllParagraphPermissionsSync(
      docId,
      paragraphIds,
      userContext,
      docPerm,
      paragraphs
    );
  }

  static async checkPermission(
    docId: string,
    paragraphId: string | 'document',
    action: PermissionAction,
    userContext: UserContext,
    paragraphs?: Paragraph[],
    permissionOverride?: DocumentPermission
  ): Promise<boolean> {
    const docPerm = permissionOverride || (await this.getOrCreateDocumentPermission(docId));
    return checkPermissionSync(
      docId,
      paragraphId,
      action,
      userContext,
      docPerm,
      paragraphs
    );
  }

  static invalidateCache(docId?: string): void {
    if (docId) {
      for (const key of permissionCache.keys()) {
        if (key.includes(`:${docId}:`)) {
          permissionCache.delete(key);
        }
      }
    } else {
      permissionCache.clear();
    }
  }

  static getCacheStats(): PermissionCacheStats {
    const entries = Array.from(permissionCache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
    }));
    const total = cacheHitCount + cacheMissCount;
    return {
      totalEntries: permissionCache.size,
      maxEntries: MAX_CACHE_ENTRIES,
      hitCount: cacheHitCount,
      missCount: cacheMissCount,
      hitRate: total > 0 ? cacheHitCount / total : 0,
      entries: entries.slice(0, 50),
    };
  }

  static resetCacheStats(): void {
    cacheHitCount = 0;
    cacheMissCount = 0;
  }

  static diffSnapshots(
    current: DocumentPermission,
    snapshot: DocumentPermission
  ): PermissionSnapshotDiff {
    const addedRules: PermissionRule[] = [];
    const removedRules: PermissionRule[] = [];
    const modifiedRules: { old: PermissionRule; new: PermissionRule }[] = [];

    const currentRuleMap = new Map(current.defaultRules.map((r) => [r.id, r]));
    const snapshotRuleMap = new Map(snapshot.defaultRules.map((r) => [r.id, r]));

    for (const [id, rule] of currentRuleMap) {
      if (!snapshotRuleMap.has(id)) {
        addedRules.push(rule);
      } else {
        const snapshotRule = snapshotRuleMap.get(id)!;
        if (JSON.stringify(rule) !== JSON.stringify(snapshotRule)) {
          modifiedRules.push({ old: snapshotRule, new: rule });
        }
      }
    }
    for (const [id, rule] of snapshotRuleMap) {
      if (!currentRuleMap.has(id)) {
        removedRules.push(rule);
      }
    }

    const currentPPIds = new Set(current.paragraphPermissions.map((p) => p.paragraphId));
    const snapshotPPIds = new Set(snapshot.paragraphPermissions.map((p) => p.paragraphId));

    const addedParagraphPermissions = Array.from(currentPPIds).filter((id) => !snapshotPPIds.has(id));
    const removedParagraphPermissions = Array.from(snapshotPPIds).filter((id) => !currentPPIds.has(id));

    const changes: string[] = [];
    if (addedRules.length > 0) changes.push(`${addedRules.length} 条新增规则`);
    if (removedRules.length > 0) changes.push(`${removedRules.length} 条删除规则`);
    if (modifiedRules.length > 0) changes.push(`${modifiedRules.length} 条修改规则`);
    if (addedParagraphPermissions.length > 0) changes.push(`${addedParagraphPermissions.length} 个新增段落权限`);
    if (removedParagraphPermissions.length > 0) changes.push(`${removedParagraphPermissions.length} 个删除段落权限`);

    const summary = changes.length > 0
      ? `权限已变更：${changes.join('，')}`
      : '权限未变更';

    return {
      addedRules,
      removedRules,
      modifiedRules,
      addedParagraphPermissions,
      removedParagraphPermissions,
      summary,
    };
  }

  static async copyPermission(sourceDocId: string, targetDocId: string): Promise<DocumentPermission> {
    const sourcePerm = await this.getDocumentPermission(sourceDocId);
    if (!sourcePerm) {
      return this.getOrCreateDocumentPermission(targetDocId);
    }

    const newRules = sourcePerm.defaultRules.map((r) => ({ ...r, id: genRuleId() }));
    const newParagraphPerms = sourcePerm.paragraphPermissions.map((pp) => ({
      ...pp,
      rules: pp.rules.map((r) => ({ ...r, id: genRuleId() })),
    }));

    const newPerm: DocumentPermission = {
      docId: targetDocId,
      defaultRules: newRules,
      paragraphPermissions: newParagraphPerms,
      alertConfig: sourcePerm.alertConfig ? { ...sourcePerm.alertConfig } : undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.saveDocumentPermission(newPerm);
    return newPerm;
  }

  static async deleteDocumentPermission(docId: string): Promise<void> {
    await FileStorageService.deleteFile(FileStorageService.getPermissionPath(docId));
    this.invalidateCache(docId);
  }

  static async setAlertConfig(docId: string, config: import('../../shared/types.js').PermissionAlertConfig): Promise<DocumentPermission> {
    const perm = await this.getOrCreateDocumentPermission(docId);
    perm.alertConfig = config;
    await this.saveDocumentPermission(perm);
    return perm;
  }

  static async getAlertConfig(docId: string): Promise<import('../../shared/types.js').PermissionAlertConfig | null> {
    const perm = await this.getDocumentPermission(docId);
    return perm?.alertConfig || null;
  }
}

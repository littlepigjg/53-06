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
import { CacheService, buildCacheKey } from '../utils/CacheService.js';
import {
  matchRule,
  evaluateRules,
  buildSectionMap,
  calculateEffectivePermissionSync,
  calculateAllParagraphPermissionsSync,
  checkPermissionSync,
  hashDocumentPermission,
} from '../utils/PermissionCalculator.js';

function genRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_CACHE_ENTRIES = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const realtimeCache = new CacheService<EffectivePermission>({
  maxEntries: MAX_CACHE_ENTRIES,
  ttlMs: CACHE_TTL_MS,
});

const snapshotCache = new CacheService<EffectivePermission>({
  maxEntries: MAX_CACHE_ENTRIES,
  ttlMs: 30 * 60 * 1000,
});

function getUserKey(userContext: UserContext): string {
  return buildCacheKey([
    userContext.userId || '',
    userContext.email || '',
    (userContext.groups || []).join(','),
    (userContext.roles || []).join(','),
    String(userContext.isAdmin || false),
  ]);
}

function getRealtimeCacheKey(
  docId: string,
  paragraphId: string | 'document',
  userContext: UserContext
): string {
  return buildCacheKey([docId, paragraphId, getUserKey(userContext)]);
}

function getSnapshotCacheKey(
  snapshotHash: string,
  docId: string,
  paragraphId: string | 'document',
  userContext: UserContext
): string {
  return buildCacheKey([snapshotHash, docId, paragraphId, getUserKey(userContext)]);
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
    this.invalidateRealtimeCache(permission.docId);
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
    options: {
      forceRefresh?: boolean;
      permissionOverride?: DocumentPermission;
      paragraphs?: Paragraph[];
    } = {}
  ): Promise<EffectivePermission> {
    const { forceRefresh = false, permissionOverride, paragraphs } = options;

    if (permissionOverride) {
      const snapshotHash = hashDocumentPermission(permissionOverride);
      const cacheKey = getSnapshotCacheKey(snapshotHash, docId, paragraphId, userContext);

      if (!forceRefresh) {
        const cached = snapshotCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const perm = this.calculateSync(docId, paragraphId, userContext, permissionOverride, paragraphs);
      snapshotCache.set(cacheKey, perm);
      return perm;
    }

    const cacheKey = getRealtimeCacheKey(docId, paragraphId, userContext);

    if (!forceRefresh) {
      const cached = realtimeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const docPerm = await this.getOrCreateDocumentPermission(docId);
    const perm = this.calculateSync(docId, paragraphId, userContext, docPerm, paragraphs);
    realtimeCache.set(cacheKey, perm);
    return perm;
  }

  private static calculateSync(
    docId: string,
    paragraphId: string | 'document',
    userContext: UserContext,
    docPerm: DocumentPermission,
    paragraphs?: Paragraph[]
  ): EffectivePermission {
    if (userContext.isAdmin) {
      return {
        paragraphId,
        canRead: true,
        canEdit: true,
        canComment: true,
        canAnnotate: true,
        canShare: true,
        isAdmin: true,
        matchedRules: ['admin'],
      };
    }

    return calculateEffectivePermissionSync({
      docId,
      paragraphId,
      userContext,
      docPerm,
      paragraphs,
    });
  }

  static async calculateAllParagraphPermissions(
    docId: string,
    paragraphIds: string[],
    userContext: UserContext,
    options: {
      permissionOverride?: DocumentPermission;
      paragraphs?: Paragraph[];
    } = {}
  ): Promise<Map<string, EffectivePermission>> {
    const { permissionOverride, paragraphs } = options;
    const results = new Map<string, EffectivePermission>();
    const uncachedIds: string[] = [];

    if (permissionOverride) {
      const snapshotHash = hashDocumentPermission(permissionOverride);
      for (const pid of paragraphIds) {
        const cacheKey = getSnapshotCacheKey(snapshotHash, docId, pid, userContext);
        const cached = snapshotCache.get(cacheKey);
        if (cached) {
          results.set(pid, cached);
        } else {
          uncachedIds.push(pid);
        }
      }

      const docCacheKey = getSnapshotCacheKey(snapshotHash, docId, 'document', userContext);
      const docCached = snapshotCache.get(docCacheKey);
      if (docCached) {
        results.set('document', docCached);
      }

      if (uncachedIds.length > 0 || !docCached) {
        const docPerm = permissionOverride;
        const allUncachedIds = !docCached ? ['document', ...uncachedIds] : uncachedIds;
        const computed = calculateAllParagraphPermissionsSync(
          docId,
          allUncachedIds.filter((id) => id !== 'document'),
          userContext,
          docPerm,
          paragraphs
        );

        for (const [id, perm] of computed) {
          results.set(id, perm);
          const key = getSnapshotCacheKey(snapshotHash, docId, id, userContext);
          snapshotCache.set(key, perm);
        }
      }
    } else {
      for (const pid of paragraphIds) {
        const cacheKey = getRealtimeCacheKey(docId, pid, userContext);
        const cached = realtimeCache.get(cacheKey);
        if (cached) {
          results.set(pid, cached);
        } else {
          uncachedIds.push(pid);
        }
      }

      const docCacheKey = getRealtimeCacheKey(docId, 'document', userContext);
      const docCached = realtimeCache.get(docCacheKey);
      if (docCached) {
        results.set('document', docCached);
      }

      if (uncachedIds.length > 0 || !docCached) {
        const docPerm = await this.getOrCreateDocumentPermission(docId);
        const allUncachedIds = !docCached ? ['document', ...uncachedIds] : uncachedIds;
        const computed = calculateAllParagraphPermissionsSync(
          docId,
          allUncachedIds.filter((id) => id !== 'document'),
          userContext,
          docPerm,
          paragraphs
        );

        for (const [id, perm] of computed) {
          results.set(id, perm);
          const key = getRealtimeCacheKey(docId, id, userContext);
          realtimeCache.set(key, perm);
        }
      }
    }

    return results;
  }

  static async checkPermission(
    docId: string,
    paragraphId: string | 'document',
    action: PermissionAction,
    userContext: UserContext,
    options: {
      paragraphs?: Paragraph[];
      permissionOverride?: DocumentPermission;
    } = {}
  ): Promise<boolean> {
    const perm = await this.calculateEffectivePermission(docId, paragraphId, userContext, options);
    switch (action) {
      case 'read':
        return perm.canRead;
      case 'edit':
        return perm.canEdit;
      case 'comment':
        return perm.canComment;
      case 'annotate':
        return perm.canAnnotate;
      case 'share':
        return perm.canShare;
      case 'admin':
        return perm.isAdmin;
      default:
        return false;
    }
  }

  static invalidateRealtimeCache(docId?: string): void {
    if (docId) {
      realtimeCache.deleteByPattern(`${docId}:`);
    } else {
      realtimeCache.clear();
    }
  }

  static invalidateSnapshotCache(snapshotHash?: string): void {
    if (snapshotHash) {
      snapshotCache.deleteByPrefix(`${snapshotHash}:`);
    } else {
      snapshotCache.clear();
    }
  }

  static invalidateAllCache(): void {
    realtimeCache.clear();
    snapshotCache.clear();
  }

  static getCacheStats(): PermissionCacheStats {
    const realtimeStats = realtimeCache.getStats();
    const snapshotStats = snapshotCache.getStats();
    const totalEntries = realtimeStats.totalEntries + snapshotStats.totalEntries;
    const totalHits = realtimeStats.hitCount + snapshotStats.hitCount;
    const totalMisses = realtimeStats.missCount + snapshotStats.missCount;
    const total = totalHits + totalMisses;

    const entries = [
      ...realtimeStats.sampleKeys.slice(0, 25).map((k) => ({ key: `rt:${k}`, age: 0 })),
      ...snapshotStats.sampleKeys.slice(0, 25).map((k) => ({ key: `snap:${k}`, age: 0 })),
    ];

    return {
      totalEntries,
      maxEntries: MAX_CACHE_ENTRIES * 2,
      hitCount: totalHits,
      missCount: totalMisses,
      hitRate: total > 0 ? totalHits / total : 0,
      entries: entries.slice(0, 50) as unknown as { key: string; age: number }[],
    };
  }

  static resetCacheStats(): void {
    realtimeCache.resetStats();
    snapshotCache.resetStats();
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
    this.invalidateRealtimeCache(docId);
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

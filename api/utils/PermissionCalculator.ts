import type {
  DocumentPermission,
  ParagraphPermission,
  PermissionRule,
  UserContext,
  EffectivePermission,
  PermissionAction,
  Paragraph,
} from '../../shared/types.js';

export function matchRule(rule: PermissionRule, userContext: UserContext): boolean {
  if (userContext.isAdmin) return true;

  switch (rule.subjectType) {
    case 'everyone':
      return true;

    case 'user':
      return (
        userContext.userId === rule.subjectValue ||
        userContext.email?.toLowerCase() === rule.subjectValue.toLowerCase()
      );

    case 'group':
      return userContext.groups?.includes(rule.subjectValue) || false;

    case 'role':
      return userContext.roles?.includes(rule.subjectValue) || false;

    case 'domain': {
      if (!userContext.email) return false;
      const emailDomain = userContext.email.split('@')[1]?.toLowerCase();
      const ruleDomain = rule.subjectValue.toLowerCase().replace(/^\*/, '');
      return emailDomain === ruleDomain || emailDomain?.endsWith(ruleDomain.replace(/^\./, '')) || false;
    }

    default:
      return false;
  }
}

export function evaluateRules(rules: PermissionRule[], userContext: UserContext): Set<PermissionAction> {
  const allowedActions = new Set<PermissionAction>();
  const deniedActions = new Set<PermissionAction>();

  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sortedRules) {
    if (matchRule(rule, userContext)) {
      if (rule.deny) {
        rule.actions.forEach((a) => deniedActions.add(a));
      } else {
        rule.actions.forEach((a) => allowedActions.add(a));
      }
    }
  }

  deniedActions.forEach((a) => allowedActions.delete(a));
  return allowedActions;
}

export function buildSectionMap(
  paragraphs: Paragraph[],
  paragraphPermissions: ParagraphPermission[]
): Map<string, string> {
  const sectionPermMap = new Map<string, ParagraphPermission>();
  for (const pp of paragraphPermissions) {
    if (pp.isSection && pp.cascadeToChildren) {
      sectionPermMap.set(pp.paragraphId, pp);
    }
  }

  const paragraphToSection = new Map<string, string>();
  let currentSection: { id: string; level: number } | null = null;

  for (const p of paragraphs) {
    if (p.type === 'heading' && p.level !== undefined) {
      const sectionPerm = sectionPermMap.get(p.id);
      if (sectionPerm) {
        currentSection = { id: p.id, level: p.level };
      } else if (currentSection && p.level <= currentSection.level) {
        currentSection = null;
      }
    }
    if (currentSection && p.id !== currentSection.id) {
      const sectionPerm = sectionPermMap.get(currentSection.id);
      const existingPP = paragraphPermissions.find((pp) => pp.paragraphId === p.id);
      if (!existingPP || existingPP.inheritFromDocument !== false) {
        paragraphToSection.set(p.id, currentSection.id);
      }
    }
  }

  return paragraphToSection;
}

export interface CalculatePermissionOptions {
  docId: string;
  paragraphId: string | 'document';
  userContext: UserContext;
  docPerm: DocumentPermission;
  paragraphs?: Paragraph[];
}

export function calculateEffectivePermissionSync(
  options: CalculatePermissionOptions
): EffectivePermission {
  const { docId, paragraphId, userContext, docPerm, paragraphs } = options;

  const matchedRules: string[] = [];

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

  let rules: PermissionRule[] = [...docPerm.defaultRules];
  let inheritedFrom: string | undefined;

  if (paragraphId !== 'document') {
    const paragraphPerm = docPerm.paragraphPermissions.find((p) => p.paragraphId === paragraphId);
    if (paragraphPerm) {
      if (paragraphPerm.inheritFromDocument !== false) {
        rules = [...rules, ...paragraphPerm.rules];
      } else {
        rules = paragraphPerm.rules;
      }
    } else if (paragraphs && paragraphs.length > 0) {
      const sectionMap = buildSectionMap(paragraphs, docPerm.paragraphPermissions);
      const sectionId = sectionMap.get(paragraphId);
      if (sectionId) {
        const sectionPerm = docPerm.paragraphPermissions.find((p) => p.paragraphId === sectionId);
        if (sectionPerm) {
          inheritedFrom = `section:${sectionId}`;
          if (sectionPerm.inheritFromDocument !== false) {
            rules = [...rules, ...sectionPerm.rules];
          } else {
            rules = [...sectionPerm.rules];
          }
        }
      }
    }
  }

  if (!inheritedFrom && paragraphId !== 'document') {
    inheritedFrom = 'document';
  }

  const sortedRules = rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of sortedRules) {
    if (matchRule(rule, userContext)) {
      matchedRules.push(rule.id);
    }
  }

  const allowedActions = evaluateRules(rules, userContext);

  return {
    paragraphId,
    canRead: allowedActions.has('read'),
    canEdit: allowedActions.has('edit'),
    canComment: allowedActions.has('comment') || allowedActions.has('annotate'),
    canAnnotate: allowedActions.has('annotate'),
    canShare: allowedActions.has('share'),
    isAdmin: allowedActions.has('admin'),
    matchedRules,
    inheritedFrom,
  };
}

export function calculateAllParagraphPermissionsSync(
  docId: string,
  paragraphIds: string[],
  userContext: UserContext,
  docPerm: DocumentPermission,
  paragraphs?: Paragraph[]
): Map<string, EffectivePermission> {
  const results = new Map<string, EffectivePermission>();

  const docLevelPerm = calculateEffectivePermissionSync({
    docId,
    paragraphId: 'document',
    userContext,
    docPerm,
    paragraphs,
  });
  results.set('document', docLevelPerm);

  for (const paragraphId of paragraphIds) {
    const perm = calculateEffectivePermissionSync({
      docId,
      paragraphId,
      userContext,
      docPerm,
      paragraphs,
    });
    results.set(paragraphId, perm);
  }

  return results;
}

export function checkPermissionSync(
  docId: string,
  paragraphId: string | 'document',
  action: PermissionAction,
  userContext: UserContext,
  docPerm: DocumentPermission,
  paragraphs?: Paragraph[]
): boolean {
  const perm = calculateEffectivePermissionSync({
    docId,
    paragraphId,
    userContext,
    docPerm,
    paragraphs,
  });
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

export function hashDocumentPermission(docPerm: DocumentPermission): string {
  let hash = 0;
  const str = JSON.stringify({
    defaultRules: docPerm.defaultRules,
    paragraphPermissions: docPerm.paragraphPermissions,
  });
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getSnapshotCacheKey(
  docId: string,
  paragraphId: string | 'document',
  userContext: UserContext,
  snapshotHash?: string
): string {
  const userKey = [
    userContext.userId || '',
    userContext.email || '',
    (userContext.groups || []).join(','),
    (userContext.roles || []).join(','),
    String(userContext.isAdmin || false),
  ].join('|');
  const prefix = snapshotHash ? `snapshot:${snapshotHash}` : 'realtime';
  return `${prefix}:${docId}:${paragraphId}:${userKey}`;
}

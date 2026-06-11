export type FileType = 'markdown' | 'docx';
export type ParagraphType = 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'table';
export type AnnotationType = 'comment' | 'suggestion';
export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';

export type PermissionAction = 'read' | 'edit' | 'comment' | 'annotate' | 'share' | 'admin';
export type PermissionSubjectType = 'user' | 'group' | 'domain' | 'everyone' | 'role';
export type AuditLogType = 'access_granted' | 'access_denied' | 'permission_changed' | 'share_created' | 'share_accessed' | 'alert_triggered';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface PermissionRule {
  id: string;
  subjectType: PermissionSubjectType;
  subjectValue: string;
  actions: PermissionAction[];
  deny?: boolean;
  priority?: number;
}

export interface ParagraphPermission {
  paragraphId: string;
  rules: PermissionRule[];
  inheritFromDocument?: boolean;
  cascadeFromSection?: string;
  isSection?: boolean;
  sectionHeadingLevel?: number;
  cascadeToChildren?: boolean;
}

export interface DocumentPermission {
  docId: string;
  defaultRules: PermissionRule[];
  paragraphPermissions: ParagraphPermission[];
  alertConfig?: PermissionAlertConfig;
  updatedAt: string;
  updatedBy?: string;
}

export interface UserContext {
  userId?: string;
  email?: string;
  name?: string;
  groups?: string[];
  roles?: string[];
  isAdmin?: boolean;
}

export interface EffectivePermission {
  paragraphId: string | 'document';
  canRead: boolean;
  canEdit: boolean;
  canComment: boolean;
  canAnnotate: boolean;
  canShare: boolean;
  isAdmin: boolean;
  matchedRules: string[];
  inheritedFrom?: string;
}

export interface PermissionSnapshot {
  documentPermission: DocumentPermission;
  createdAt: string;
}

export interface ShareLinkWithSnapshot {
  token: string;
  docId: string;
  permissionSnapshot: PermissionSnapshot;
  password?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  createdBy?: string;
}

export interface AuditLogEntry {
  id: string;
  type: AuditLogType;
  docId: string;
  paragraphId?: string;
  action?: PermissionAction;
  userContext: UserContext;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export interface PermissionTemplate {
  id: string;
  name: string;
  description?: string;
  defaultRules: PermissionRule[];
  paragraphPermissionPatterns?: ParagraphPermissionPattern[];
  createdAt: string;
  updatedAt: string;
}

export interface ParagraphPermissionPattern {
  pattern: 'heading-level' | 'paragraph-type' | 'first-n' | 'custom';
  headingLevel?: number;
  paragraphType?: ParagraphType;
  count?: number;
  customSelector?: string;
  rules: Omit<PermissionRule, 'id'>[];
  inheritFromDocument?: boolean;
  cascadeToChildren?: boolean;
}

export interface DocumentMeta {
  id: string;
  title: string;
  originalFileName: string;
  fileType: FileType;
  createdAt: string;
  updatedAt: string;
  shareToken?: string;
  sharePassword?: string | null;
  shareExpiresAt?: string | null;
  annotationCount: number;
  reviewerCount: number;
}

export interface Paragraph {
  id: string;
  index: number;
  type: ParagraphType;
  level?: number;
  content: string;
  rawHtml?: string;
}

export interface ParsedDocument {
  docId: string;
  paragraphs: Paragraph[];
}

export interface Annotation {
  id: string;
  docId: string;
  paragraphId: string;
  type: AnnotationType;
  reviewerName: string;
  reviewerEmail?: string;
  content: string;
  suggestedText?: string;
  originalText?: string;
  status: AnnotationStatus;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummary {
  docId: string;
  totalAnnotations: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  commentCount: number;
  suggestionCount: number;
  byReviewer: { name: string; count: number }[];
  byParagraph: { paragraphId: string; count: number }[];
}

export interface PermissionAlertConfig {
  enabled: boolean;
  accessDeniedThreshold: number;
  accessDeniedWindowMinutes: number;
  severity: AlertSeverity;
  notifyEmails?: string[];
  escalationEnabled: boolean;
  escalationThreshold: number;
  escalationSeverity: AlertSeverity;
}

export interface AlertNotification {
  id: string;
  docId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggerCount: number;
  windowStart: string;
  windowEnd: string;
  message: string;
  affectedUsers: { userId?: string; email?: string; name?: string }[];
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export interface PermissionCacheStats {
  totalEntries: number;
  maxEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  entries: { key: string; age: number }[];
}

export interface PermissionSnapshotDiff {
  addedRules: PermissionRule[];
  removedRules: PermissionRule[];
  modifiedRules: { old: PermissionRule; new: PermissionRule }[];
  addedParagraphPermissions: string[];
  removedParagraphPermissions: string[];
  summary: string;
}

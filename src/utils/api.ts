import type {
  DocumentMeta,
  ParsedDocument,
  Annotation,
  ReviewSummary,
  AnnotationStatus,
  DocumentPermission,
  EffectivePermission,
  PermissionRule,
  PermissionAction,
  PermissionTemplate,
  ParagraphPermissionPattern,
  AuditLogEntry,
  UserContext,
  PermissionSnapshot,
  PermissionAlertConfig,
  AlertNotification,
  PermissionCacheStats,
  PermissionSnapshotDiff,
} from '../types';

const API_BASE = '/api';

let currentUserContext: Partial<UserContext> = {
  name: 'Guest',
  isAdmin: false,
};

export function setUserContext(ctx: Partial<UserContext>): void {
  currentUserContext = { ...currentUserContext, ...ctx };
}

export function getUserContext(): Partial<UserContext> {
  return { ...currentUserContext };
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (currentUserContext.userId) headers['x-user-id'] = currentUserContext.userId;
  if (currentUserContext.email) headers['x-user-email'] = currentUserContext.email;
  if (currentUserContext.name) headers['x-user-name'] = currentUserContext.name;
  if (currentUserContext.groups?.length) headers['x-user-groups'] = currentUserContext.groups.join(',');
  if (currentUserContext.roles?.length) headers['x-user-roles'] = currentUserContext.roles.join(',');
  if (currentUserContext.isAdmin !== undefined) headers['x-user-is-admin'] = String(currentUserContext.isAdmin);
  return headers;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
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

export interface ParsedWithPermissions extends ParsedDocument {
  annotations: Annotation[];
  effectivePermissions: Record<string, EffectivePermission>;
}

export interface ShareReviewData {
  document: DocumentMeta;
  parsed: ParsedWithPermissions;
  annotations: Annotation[];
  effectivePermissions: Record<string, EffectivePermission>;
  permissionSnapshot: PermissionSnapshot;
}

export const documentsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: form,
      headers: getAuthHeaders(),
    }).then((r) => r.json() as Promise<DocumentMeta>);
  },
  list: () => request<DocumentMeta[]>('/documents'),
  get: (id: string) => request<DocumentMeta>(`/documents/${id}`),
  remove: (id: string) =>
    request<{ ok: true }>(`/documents/${id}`, { method: 'DELETE' }),
  getParsed: (id: string) => request<ParsedWithPermissions>(`/documents/${id}/parsed`),
  createShare: (id: string, options?: { password?: string; expiresAt?: string }) =>
    request<{ token: string; createdAt: string; expiresAt: string | null; hasPassword: boolean }>(
      `/share/create/${id}`,
      { method: 'POST', body: JSON.stringify(options || {}) }
    ),
};

export const shareApi = {
  getReviewData: (token: string, password?: string) =>
    request<ShareReviewData>(
      `/share/${token}${password ? `?password=${encodeURIComponent(password)}` : ''}`
    ),
  revoke: (token: string) =>
    request<{ ok: true }>(`/share/revoke/${token}`, { method: 'POST' }),
  getByDocId: (docId: string) =>
    request<
      { token: string; createdAt: string; expiresAt: string | null; hasPassword: boolean; createdBy?: string }[]
    >(`/share/doc/${docId}`),
  validateAccess: (token: string, password?: string) =>
    request<{ valid: boolean; reason?: string }>(
      `/share/${token}/validate${password ? `?password=${encodeURIComponent(password)}` : ''}`
    ),
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
    fetch(`${API_BASE}/export/${docId}`, { headers: getAuthHeaders() }).then(async (r) => ({
      filename:
        r.headers.get('Content-Disposition')?.match(/filename="?([^"]+)/)?.[1] ||
        'document.md',
      text: await r.text(),
    })),
};

export const permissionsApi = {
  getDocumentPermission: (docId: string) =>
    request<DocumentPermission>(`/permissions/${docId}`),

  getEffectivePermission: (docId: string, paragraphId?: string, forceRefresh?: boolean) =>
    request<EffectivePermission>(
      `/permissions/${docId}/effective${paragraphId ? `?paragraphId=${encodeURIComponent(paragraphId)}` : ''}${forceRefresh ? '&forceRefresh=true' : ''}`
    ),

  getAllEffectivePermissions: (docId: string, paragraphIds: string[]) =>
    request<Record<string, EffectivePermission>>(
      `/permissions/${docId}/effective-all?paragraphIds=${encodeURIComponent(paragraphIds.join(','))}`
    ),

  checkPermission: (docId: string, action: PermissionAction, paragraphId?: string) =>
    request<{ hasPermission: boolean }>(`/permissions/${docId}/check`, {
      method: 'POST',
      body: JSON.stringify({ action, paragraphId }),
    }),

  setDefaultRules: (docId: string, rules: Omit<PermissionRule, 'id'>[]) =>
    request<DocumentPermission>(`/permissions/${docId}/default-rules`, {
      method: 'PUT',
      body: JSON.stringify(rules),
    }),

  addDefaultRule: (docId: string, rule: Omit<PermissionRule, 'id'>) =>
    request<DocumentPermission>(`/permissions/${docId}/default-rules`, {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  removeDefaultRule: (docId: string, ruleId: string) =>
    request<DocumentPermission>(`/permissions/${docId}/default-rules/${ruleId}`, {
      method: 'DELETE',
    }),

  setParagraphPermission: (
    docId: string,
    paragraphId: string,
    rules: Omit<PermissionRule, 'id'>[],
    inheritFromDocument = true
  ) =>
    request<DocumentPermission>(`/permissions/${docId}/paragraph-permissions/${paragraphId}`, {
      method: 'PUT',
      body: JSON.stringify({ rules, inheritFromDocument }),
    }),

  removeParagraphPermission: (docId: string, paragraphId: string) =>
    request<DocumentPermission>(`/permissions/${docId}/paragraph-permissions/${paragraphId}`, {
      method: 'DELETE',
    }),

  setSectionPermission: (
    docId: string,
    headingParagraphId: string,
    data: {
      rules: Omit<PermissionRule, 'id'>[];
      headingLevel: number;
      cascadeToChildren?: boolean;
      inheritFromDocument?: boolean;
    }
  ) =>
    request<DocumentPermission>(`/permissions/${docId}/section-permission/${headingParagraphId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  batchSetParagraphPermissions: (
    docId: string,
    items: { paragraphId: string; rules: Omit<PermissionRule, 'id'>[]; inheritFromDocument?: boolean }[]
  ) =>
    request<DocumentPermission>(`/permissions/${docId}/batch-paragraph-permissions`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  getAuditLogs: (
    docId: string,
    filters?: {
      type?: string;
      action?: PermissionAction;
      userId?: string;
      email?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.email) params.append('email', filters.email);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));
    return request<AuditLogEntry[]>(
      `/permissions/${docId}/audit-logs${params.toString() ? `?${params.toString()}` : ''}`
    );
  },

  getAuditStatistics: (docId: string) =>
    request<{
      total: number;
      accessGranted: number;
      accessDenied: number;
      permissionChanged: number;
      shareCreated: number;
      shareAccessed: number;
      alertTriggered: number;
      byDate: { date: string; count: number }[];
    }>(`/permissions/${docId}/audit-logs/statistics`),

  getAccessDeniedLogs: (docId: string, limit?: number) =>
    request<AuditLogEntry[]>(
      `/permissions/${docId}/audit-logs/access-denied${limit ? `?limit=${limit}` : ''}`
    ),

  getAlerts: (docId: string) =>
    request<AlertNotification[]>(`/permissions/${docId}/alerts`),

  getActiveAlerts: (docId: string) =>
    request<AlertNotification[]>(`/permissions/${docId}/alerts/active`),

  acknowledgeAlert: (docId: string, alertId: string) =>
    request<AlertNotification>(`/permissions/${docId}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    }),

  resolveAlert: (docId: string, alertId: string) =>
    request<AlertNotification>(`/permissions/${docId}/alerts/${alertId}/resolve`, {
      method: 'POST',
    }),

  getAlertConfig: (docId: string) =>
    request<PermissionAlertConfig>(`/permissions/${docId}/alert-config`),

  setAlertConfig: (docId: string, config: PermissionAlertConfig) =>
    request<PermissionAlertConfig>(`/permissions/${docId}/alert-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getTemplates: () => request<PermissionTemplate[]>('/permissions/templates/list'),

  getTemplate: (id: string) => request<PermissionTemplate>(`/permissions/templates/${id}`),

  createTemplate: (data: {
    name: string;
    description?: string;
    defaultRules: Omit<PermissionRule, 'id'>[];
    paragraphPermissionPatterns?: ParagraphPermissionPattern[];
  }) =>
    request<PermissionTemplate>('/permissions/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: (
    id: string,
    data: {
      name?: string;
      description?: string;
      defaultRules?: Omit<PermissionRule, 'id'>[];
      paragraphPermissionPatterns?: ParagraphPermissionPattern[];
    }
  ) =>
    request<PermissionTemplate>(`/permissions/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (id: string) =>
    request<{ ok: true }>(`/permissions/templates/${id}`, { method: 'DELETE' }),

  applyTemplate: (templateId: string, docId: string) =>
    request<{ ok: true; permission: DocumentPermission }>(
      `/permissions/templates/${templateId}/apply/${docId}`,
      { method: 'POST' }
    ),

  createTemplateFromDocument: (
    docId: string,
    data: { name: string; description?: string }
  ) =>
    request<PermissionTemplate>(`/permissions/templates/from-document/${docId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  copyPermission: (sourceDocId: string, targetDocId: string) =>
    request<DocumentPermission>(`/permissions/copy/${sourceDocId}/to/${targetDocId}`, {
      method: 'POST',
    }),

  getCacheStats: () =>
    request<PermissionCacheStats>('/permissions/cache/stats'),

  resetCacheStats: () =>
    request<{ ok: true }>('/permissions/cache/reset-stats', { method: 'POST' }),

  clearCache: (docId: string) =>
    request<{ ok: true }>(`/permissions/cache/clear/${docId}`, { method: 'POST' }),

  clearAllCache: () =>
    request<{ ok: true }>('/permissions/cache/clear-all', { method: 'POST' }),

  getSnapshotDiff: (currentDocId: string, snapshotDocId: string) =>
    request<PermissionSnapshotDiff>('/permissions/snapshot-diff', {
      method: 'POST',
      body: JSON.stringify({ currentDocId, snapshotDocId }),
    }),
};

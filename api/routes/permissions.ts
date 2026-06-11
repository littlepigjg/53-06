import { Router } from 'express';
import type { PermissionRule, PermissionAction, AuditLogType, PermissionAlertConfig } from '../../shared/types.js';
import { PermissionService } from '../services/PermissionService.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { PermissionTemplateService } from '../services/PermissionTemplateService.js';
import { DocumentParser } from '../services/DocumentParser.js';
import { extractUserContext, requireAdmin } from '../middleware/authPermission.js';

const router = Router();

router.get('/:docId', async (req, res, next) => {
  try {
    const perm = await PermissionService.getOrCreateDocumentPermission(req.params.docId);
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/effective', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { paragraphId } = req.query;
    const parsed = await DocumentParser.getParsed(req.params.docId);
    const perm = await PermissionService.calculateEffectivePermission(
      req.params.docId,
      (paragraphId as string) || 'document',
      userContext,
      req.query.forceRefresh === 'true',
      undefined,
      parsed.paragraphs
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/effective-all', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { paragraphIds } = req.query;
    const ids = typeof paragraphIds === 'string' ? paragraphIds.split(',') : [];
    const parsed = await DocumentParser.getParsed(req.params.docId);
    const perms = await PermissionService.calculateAllParagraphPermissions(
      req.params.docId,
      ids,
      userContext,
      undefined,
      parsed.paragraphs
    );
    const result: Record<string, unknown> = {};
    perms.forEach((value, key) => {
      result[key] = value;
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:docId/check', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { action, paragraphId } = req.body as { action: PermissionAction; paragraphId?: string };
    const parsed = await DocumentParser.getParsed(req.params.docId);
    const hasPermission = await PermissionService.checkPermission(
      req.params.docId,
      paragraphId || 'document',
      action,
      userContext,
      parsed.paragraphs
    );
    res.json({ hasPermission });
  } catch (e) {
    next(e);
  }
});

router.put('/:docId/default-rules', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const rules = req.body as Omit<PermissionRule, 'id'>[];
    const perm = await PermissionService.setDefaultRules(req.params.docId, rules);
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'set_default_rules', ruleCount: rules.length },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.post('/:docId/default-rules', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const rule = req.body as Omit<PermissionRule, 'id'>;
    const perm = await PermissionService.addDefaultRule(req.params.docId, rule);
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'add_default_rule', rule },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.delete('/:docId/default-rules/:ruleId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const perm = await PermissionService.removeDefaultRule(req.params.docId, req.params.ruleId);
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'remove_default_rule', ruleId: req.params.ruleId },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.put('/:docId/paragraph-permissions/:paragraphId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { rules, inheritFromDocument } = req.body as {
      rules: Omit<PermissionRule, 'id'>[];
      inheritFromDocument?: boolean;
    };
    const perm = await PermissionService.setParagraphPermission(
      req.params.docId,
      req.params.paragraphId,
      rules,
      inheritFromDocument
    );
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'set_paragraph_permission', paragraphId: req.params.paragraphId, ruleCount: rules.length },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.delete('/:docId/paragraph-permissions/:paragraphId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const perm = await PermissionService.removeParagraphPermission(
      req.params.docId,
      req.params.paragraphId
    );
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'remove_paragraph_permission', paragraphId: req.params.paragraphId },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.put('/:docId/section-permission/:headingParagraphId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { rules, headingLevel, cascadeToChildren, inheritFromDocument } = req.body as {
      rules: Omit<PermissionRule, 'id'>[];
      headingLevel: number;
      cascadeToChildren?: boolean;
      inheritFromDocument?: boolean;
    };
    const perm = await PermissionService.setSectionPermission(
      req.params.docId,
      req.params.headingParagraphId,
      headingLevel,
      rules,
      cascadeToChildren,
      inheritFromDocument
    );
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'set_section_permission', paragraphId: req.params.headingParagraphId, headingLevel, cascadeToChildren },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.post('/:docId/batch-paragraph-permissions', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { items } = req.body as {
      items: { paragraphId: string; rules: Omit<PermissionRule, 'id'>[]; inheritFromDocument?: boolean }[];
    };
    const perm = await PermissionService.batchSetParagraphPermissions(req.params.docId, items);
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'batch_set_paragraph_permissions', count: items.length },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/audit-logs', requireAdmin, async (req, res, next) => {
  try {
    const { type, action, userId, email, startDate, endDate, limit } = req.query;
    const logs = await AuditLogService.queryLogs(req.params.docId, {
      type: type as AuditLogType | undefined,
      action: action as PermissionAction | undefined,
      userId: userId as string | undefined,
      email: email as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/audit-logs/statistics', requireAdmin, async (req, res, next) => {
  try {
    const stats = await AuditLogService.getStatistics(req.params.docId);
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/audit-logs/access-denied', requireAdmin, async (req, res, next) => {
  try {
    const { limit } = req.query;
    const logs = await AuditLogService.getAccessDeniedLogs(
      req.params.docId,
      limit ? parseInt(limit as string, 10) : 50
    );
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/alerts', requireAdmin, async (req, res, next) => {
  try {
    const alerts = await AuditLogService.getAlerts(req.params.docId);
    res.json(alerts);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/alerts/active', requireAdmin, async (req, res, next) => {
  try {
    const alerts = await AuditLogService.getActiveAlerts(req.params.docId);
    res.json(alerts);
  } catch (e) {
    next(e);
  }
});

router.post('/:docId/alerts/:alertId/acknowledge', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const alert = await AuditLogService.acknowledgeAlert(
      req.params.docId,
      req.params.alertId,
      userContext.userId || userContext.email || 'admin'
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (e) {
    next(e);
  }
});

router.post('/:docId/alerts/:alertId/resolve', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const alert = await AuditLogService.resolveAlert(
      req.params.docId,
      req.params.alertId,
      userContext.userId || userContext.email || 'admin'
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (e) {
    next(e);
  }
});

router.get('/:docId/alert-config', requireAdmin, async (req, res, next) => {
  try {
    const config = await PermissionService.getAlertConfig(req.params.docId);
    res.json(config || AuditLogService.getDefaultAlertConfig());
  } catch (e) {
    next(e);
  }
});

router.put('/:docId/alert-config', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const config = req.body as PermissionAlertConfig;
    const perm = await PermissionService.setAlertConfig(req.params.docId, config);
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'update_alert_config', config },
      req.ip
    );
    res.json(perm.alertConfig);
  } catch (e) {
    next(e);
  }
});

router.get('/templates/list', async (_req, res, next) => {
  try {
    const templates = await PermissionTemplateService.list();
    const builtin = await PermissionTemplateService.getBuiltinTemplates();
    res.json([...builtin, ...templates]);
  } catch (e) {
    next(e);
  }
});

router.get('/templates/:id', async (req, res, next) => {
  try {
    const template = await PermissionTemplateService.get(req.params.id);
    if (!template) {
      const builtin = await PermissionTemplateService.getBuiltinTemplates();
      const builtinTemplate = builtin.find((t) => t.id === req.params.id);
      if (builtinTemplate) {
        return res.json(builtinTemplate);
      }
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (e) {
    next(e);
  }
});

router.post('/templates', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const data = req.body as {
      name: string;
      description?: string;
      defaultRules: Omit<PermissionRule, 'id'>[];
      paragraphPermissionPatterns?: import('../../shared/types.js').ParagraphPermissionPattern[];
    };
    const template = await PermissionTemplateService.create(data, userContext);
    res.json(template);
  } catch (e) {
    next(e);
  }
});

router.put('/templates/:id', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const data = req.body as {
      name?: string;
      description?: string;
      defaultRules?: Omit<PermissionRule, 'id'>[];
      paragraphPermissionPatterns?: import('../../shared/types.js').ParagraphPermissionPattern[];
    };
    const template = await PermissionTemplateService.update(req.params.id, data, userContext);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (e) {
    next(e);
  }
});

router.delete('/templates/:id', requireAdmin, async (req, res, next) => {
  try {
    const ok = await PermissionTemplateService.remove(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/templates/:id/apply/:docId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const parsed = await DocumentParser.getParsed(req.params.docId);
    const ok = await PermissionTemplateService.applyToDocument(
      req.params.id,
      req.params.docId,
      parsed.paragraphs
    );
    if (!ok) {
      return res.status(404).json({ error: 'Template or document not found' });
    }
    await AuditLogService.logPermissionChanged(
      req.params.docId,
      userContext,
      { type: 'apply_template', templateId: req.params.id },
      req.ip
    );
    const perm = await PermissionService.getDocumentPermission(req.params.docId);
    res.json({ ok: true, permission: perm });
  } catch (e) {
    next(e);
  }
});

router.post('/templates/from-document/:docId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const data = req.body as { name: string; description?: string };
    const template = await PermissionTemplateService.createFromDocument(
      req.params.docId,
      data,
      userContext
    );
    if (!template) {
      return res.status(404).json({ error: 'Document not found or has no permissions' });
    }
    res.json(template);
  } catch (e) {
    next(e);
  }
});

router.post('/copy/:sourceDocId/to/:targetDocId', requireAdmin, async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const perm = await PermissionService.copyPermission(req.params.sourceDocId, req.params.targetDocId);
    await AuditLogService.logPermissionChanged(
      req.params.targetDocId,
      userContext,
      { type: 'copy_permission', sourceDocId: req.params.sourceDocId },
      req.ip
    );
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.get('/cache/stats', requireAdmin, async (_req, res, next) => {
  try {
    const stats = PermissionService.getCacheStats();
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

router.post('/cache/reset-stats', requireAdmin, async (_req, res, next) => {
  try {
    PermissionService.resetCacheStats();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/cache/clear/:docId', requireAdmin, async (req, res, next) => {
  try {
    PermissionService.invalidateCache(req.params.docId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/cache/clear-all', requireAdmin, async (_req, res, next) => {
  try {
    PermissionService.invalidateCache();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/snapshot-diff', requireAdmin, async (req, res, next) => {
  try {
    const { currentDocId, snapshotDocId } = req.body as { currentDocId: string; snapshotDocId: string };
    const currentPerm = await PermissionService.getDocumentPermission(currentDocId);
    if (!currentPerm) return res.status(404).json({ error: 'Current document permission not found' });

    const snapshotPerm = await PermissionService.getDocumentPermission(snapshotDocId);
    if (!snapshotPerm) return res.status(404).json({ error: 'Snapshot document permission not found' });

    const diff = PermissionService.diffSnapshots(currentPerm, snapshotPerm);
    res.json(diff);
  } catch (e) {
    next(e);
  }
});

export default router;

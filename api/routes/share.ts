import { Router } from 'express';
import { ShareLinkService } from '../services/ShareLinkService.js';
import { DocumentParser } from '../services/DocumentParser.js';
import { AnnotationService } from '../services/AnnotationService.js';
import { PermissionService } from '../services/PermissionService.js';
import { DocumentService } from '../services/DocumentService.js';
import { extractUserContext } from '../middleware/authPermission.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { password } = req.query;

    const validation = await ShareLinkService.validateAccess(
      req.params.token,
      password as string | undefined,
      userContext,
      req.ip,
      req.headers['user-agent']
    );

    if (!validation.valid || !validation.link) {
      return res.status(404).json({ error: validation.reason || 'Invalid or expired link' });
    }

    const link = validation.link;
    const doc = await DocumentService.get(link.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const parsed = await DocumentParser.getParsed(link.docId);
    const annotations = await AnnotationService.list(link.docId);

    const paragraphIds = parsed.paragraphs.map((p) => p.id);
    const allPerms = await PermissionService.calculateAllParagraphPermissions(
      link.docId,
      paragraphIds,
      userContext,
      {
        permissionOverride: link.permissionSnapshot.documentPermission,
        paragraphs: parsed.paragraphs,
      }
    );

    const visibleParagraphs = parsed.paragraphs.filter((p) => {
      const perm = allPerms.get(p.id);
      return perm?.canRead;
    });

    const visibleAnnotationIds = new Set(
      visibleParagraphs.map((p) => p.id)
    );
    const visibleAnnotations = annotations.filter(
      (a) => visibleAnnotationIds.has(a.paragraphId)
    );

    const effectivePermissions: Record<string, unknown> = {};
    allPerms.forEach((value, key) => {
      effectivePermissions[key] = value;
    });

    res.json({
      document: doc,
      parsed: {
        ...parsed,
        paragraphs: visibleParagraphs,
      },
      annotations: visibleAnnotations,
      effectivePermissions,
      permissionSnapshot: link.permissionSnapshot,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/create/:docId', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req);
    const { password, expiresAt } = req.body as {
      password?: string;
      expiresAt?: string;
    };

    const shareLink = await ShareLinkService.create(req.params.docId, {
      password,
      expiresAt,
      userContext,
      ip: req.ip,
    });

    res.json({
      token: shareLink.token,
      createdAt: shareLink.createdAt,
      expiresAt: shareLink.expiresAt,
      hasPassword: !!shareLink.password,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/revoke/:token', async (req, res, next) => {
  try {
    const ok = await ShareLinkService.revoke(req.params.token);
    if (!ok) return res.status(404).json({ error: 'Share link not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/doc/:docId', async (req, res, next) => {
  try {
    const links = await ShareLinkService.getByDocId(req.params.docId);
    res.json(
      links.map((l) => ({
        token: l.token,
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
        hasPassword: !!l.password,
        createdBy: l.createdBy,
      }))
    );
  } catch (e) {
    next(e);
  }
});

export default router;

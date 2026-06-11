import type { Request, Response, NextFunction } from 'express';
import type { UserContext, PermissionAction, DocumentPermission } from '../../shared/types.js';
import { PermissionService } from '../services/PermissionService.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { ShareLinkService } from '../services/ShareLinkService.js';
import { DocumentParser } from '../services/DocumentParser.js';

declare global {
  namespace Express {
    interface Request {
      userContext?: UserContext;
      permissionSnapshot?: DocumentPermission;
      shareToken?: string;
    }
  }
}

export function extractUserContext(req: Request): UserContext {
  const headerUserId = req.headers['x-user-id'] as string;
  const headerEmail = req.headers['x-user-email'] as string;
  const headerName = req.headers['x-user-name'] as string;
  const headerGroups = req.headers['x-user-groups'] as string;
  const headerRoles = req.headers['x-user-roles'] as string;
  const headerIsAdmin = req.headers['x-user-is-admin'] as string;

  return {
    userId: headerUserId || undefined,
    email: headerEmail || undefined,
    name: headerName || 'anonymous',
    groups: headerGroups ? headerGroups.split(',').map((g) => g.trim()) : undefined,
    roles: headerRoles ? headerRoles.split(',').map((r) => r.trim()) : undefined,
    isAdmin: headerIsAdmin === 'true',
  };
}

export function extractShareToken(req: Request): string | undefined {
  if (req.params.token) return req.params.token;
  if (req.query.shareToken && typeof req.query.shareToken === 'string') return req.query.shareToken;
  const headerToken = req.headers['x-share-token'];
  if (headerToken && typeof headerToken === 'string') return headerToken;
  return undefined;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.userContext = extractUserContext(req);
  next();
}

export interface PermissionCheckOptions {
  action: PermissionAction;
  docIdParam?: string;
  paragraphIdParam?: string;
  requireDocPermission?: boolean;
}

export function requirePermission(options: PermissionCheckOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userContext = req.userContext || extractUserContext(req);
      const docId = options.docIdParam
        ? (req.params[options.docIdParam] as string)
        : (req.params.id as string);
      const paragraphId = options.paragraphIdParam
        ? (req.params[options.paragraphIdParam] as string)
        : (req.body.paragraphId as string) || undefined;

      if (!docId) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      const permissionOverride: DocumentPermission | undefined = req.permissionSnapshot;

      let paragraphs: import('../../shared/types.js').Paragraph[] | undefined;
      try {
        const parsed = await DocumentParser.getParsed(docId);
        paragraphs = parsed.paragraphs;
      } catch {
        // ignore
      }

      const hasPermission = await PermissionService.checkPermission(
        docId,
        paragraphId || 'document',
        options.action,
        userContext,
        {
          paragraphs,
          permissionOverride,
        }
      );

      if (!hasPermission) {
        await AuditLogService.logAccessDenied(
          docId,
          paragraphId,
          options.action,
          userContext,
          req.ip,
          req.headers['user-agent'],
          {
            path: req.path,
            method: req.method,
            usingSnapshot: !!permissionOverride,
            shareToken: req.shareToken,
          }
        );

        return res.status(403).json({
          error: 'Permission denied',
          requiredAction: options.action,
          docId,
          paragraphId,
          usingSnapshot: !!permissionOverride,
        });
      }

      await AuditLogService.logAccessGranted(
        docId,
        paragraphId,
        options.action,
        userContext,
        req.ip,
        req.headers['user-agent']
      );

      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const userContext = req.userContext || extractUserContext(req);

  if (!userContext.isAdmin) {
    res.status(403).json({
      error: 'Admin permission required',
    });
    return;
  }

  next();
}

export function attachPermissionSnapshot() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.permissionSnapshot) {
      next();
      return;
    }

    const token = extractShareToken(req);
    if (!token) {
      next();
      return;
    }

    try {
      const snapshot = await ShareLinkService.getPermissionSnapshot(token);
      if (snapshot) {
        req.permissionSnapshot = snapshot.documentPermission;
        req.shareToken = token;
      }
    } catch {
      // ignore
    }

    next();
  };
}

export function validateShareLink() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractShareToken(req);
    if (!token) {
      return res.status(400).json({ error: 'Share token is required' });
    }

    const userContext = req.userContext || extractUserContext(req);
    const validation = await ShareLinkService.validateAccess(
      token,
      undefined,
      userContext,
      req.ip,
      req.headers['user-agent']
    );

    if (!validation.valid || !validation.link) {
      return res.status(404).json({ error: validation.reason || 'Invalid or expired share link' });
    }

    req.shareToken = token;
    req.permissionSnapshot = validation.link.permissionSnapshot.documentPermission;

    next();
  };
}

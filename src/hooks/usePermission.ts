import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EffectivePermission, PermissionAction, UserContext } from '../types';
import { permissionsApi, setUserContext, getUserContext } from '../utils/api';

export function useUserContext() {
  const [userContext, setLocalUserContext] = useState<Partial<UserContext>>(getUserContext());

  const updateUserContext = useCallback((ctx: Partial<UserContext>) => {
    setUserContext(ctx);
    setLocalUserContext(getUserContext());
  }, []);

  return {
    userContext,
    updateUserContext,
    isAdmin: userContext.isAdmin || false,
  };
}

export function usePermission(docId: string, paragraphId?: string) {
  const [permission, setPermission] = useState<EffectivePermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPermission = useCallback(
    async (forceRefresh = false) => {
      if (!docId) return;
      setLoading(true);
      setError(null);
      try {
        const perm = await permissionsApi.getEffectivePermission(docId, paragraphId, forceRefresh);
        setPermission(perm);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Failed to fetch permission'));
      } finally {
        setLoading(false);
      }
    },
    [docId, paragraphId]
  );

  useEffect(() => {
    fetchPermission();
  }, [fetchPermission]);

  const can = useCallback(
    (action: PermissionAction): boolean => {
      if (!permission) return false;
      switch (action) {
        case 'read':
          return permission.canRead;
        case 'edit':
          return permission.canEdit;
        case 'comment':
          return permission.canComment;
        case 'annotate':
          return permission.canAnnotate;
        case 'share':
          return permission.canShare;
        case 'admin':
          return permission.isAdmin;
        default:
          return false;
      }
    },
    [permission]
  );

  return {
    permission,
    loading,
    error,
    can,
    canRead: permission?.canRead || false,
    canEdit: permission?.canEdit || false,
    canComment: permission?.canComment || false,
    canAnnotate: permission?.canAnnotate || false,
    canShare: permission?.canShare || false,
    isAdmin: permission?.isAdmin || false,
    refresh: () => fetchPermission(true),
  };
}

export function useAllPermissions(docId: string, paragraphIds: string[]) {
  const [permissions, setPermissions] = useState<Record<string, EffectivePermission>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!docId || paragraphIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const perms = await permissionsApi.getAllEffectivePermissions(docId, paragraphIds);
      setPermissions(perms);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch permissions'));
    } finally {
      setLoading(false);
    }
  }, [docId, paragraphIds.join(',')]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const getPermission = useCallback(
    (paragraphId: string): EffectivePermission | undefined => {
      return permissions[paragraphId];
    },
    [permissions]
  );

  const can = useCallback(
    (paragraphId: string, action: PermissionAction): boolean => {
      const perm = permissions[paragraphId] || permissions['document'];
      if (!perm) return false;
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
    },
    [permissions]
  );

  const canAny = useCallback(
    (action: PermissionAction): boolean => {
      return Object.values(permissions).some((p) => {
        switch (action) {
          case 'read':
            return p.canRead;
          case 'edit':
            return p.canEdit;
          case 'comment':
            return p.canComment;
          case 'annotate':
            return p.canAnnotate;
          case 'share':
            return p.canShare;
          case 'admin':
            return p.isAdmin;
          default:
            return false;
        }
      });
    },
    [permissions]
  );

  const canAll = useCallback(
    (action: PermissionAction): boolean => {
      if (Object.keys(permissions).length === 0) return false;
      return Object.values(permissions).every((p) => {
        switch (action) {
          case 'read':
            return p.canRead;
          case 'edit':
            return p.canEdit;
          case 'comment':
            return p.canComment;
          case 'annotate':
            return p.canAnnotate;
          case 'share':
            return p.canShare;
          case 'admin':
            return p.isAdmin;
          default:
            return false;
        }
      });
    },
    [permissions]
  );

  return {
    permissions,
    loading,
    error,
    getPermission,
    can,
    canAny,
    canAll,
    refresh: fetchPermissions,
  };
}

export function usePermissionCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  const check = useCallback(
    async (docId: string, action: PermissionAction, paragraphId?: string): Promise<boolean> => {
      setLoading(true);
      try {
        const res = await permissionsApi.checkPermission(docId, action, paragraphId);
        setResult(res.hasPermission);
        return res.hasPermission;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { check, loading, result };
}

export function usePermissionsFromData(effectivePermissions?: Record<string, EffectivePermission>) {
  const permissions = useMemo(() => effectivePermissions || {}, [effectivePermissions]);

  const getPermission = useCallback(
    (paragraphId: string): EffectivePermission | undefined => {
      return permissions[paragraphId] || permissions['document'];
    },
    [permissions]
  );

  const can = useCallback(
    (paragraphId: string, action: PermissionAction): boolean => {
      const perm = getPermission(paragraphId);
      if (!perm) return false;
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
    },
    [getPermission]
  );

  return {
    permissions,
    getPermission,
    can,
    canRead: (paragraphId: string) => can(paragraphId, 'read'),
    canEdit: (paragraphId: string) => can(paragraphId, 'edit'),
    canComment: (paragraphId: string) => can(paragraphId, 'comment'),
    canAnnotate: (paragraphId: string) => can(paragraphId, 'annotate'),
    canShare: (paragraphId: string) => can(paragraphId, 'share'),
    isAdmin: (paragraphId: string) => can(paragraphId, 'admin'),
  };
}

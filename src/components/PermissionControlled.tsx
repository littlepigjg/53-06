import { useState, useCallback, type ReactNode } from 'react';
import type { PermissionAction, EffectivePermission, UserContext } from '../types';
import { usePermission, usePermissionsFromData } from '../hooks/usePermission';
import { setUserContext, getUserContext } from '../utils/api';

interface PermissionControlledProps {
  docId: string;
  paragraphId?: string;
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
  hideWhenDenied?: boolean;
  disableWhenDenied?: boolean;
  showTooltip?: boolean;
  permissionData?: Record<string, EffectivePermission>;
}

export function PermissionControlled({
  docId,
  paragraphId,
  action,
  children,
  fallback = null,
  hideWhenDenied = true,
  disableWhenDenied = false,
  showTooltip = false,
  permissionData,
}: PermissionControlledProps) {
  const { can: canFromData } = usePermissionsFromData(permissionData || {});
  const { can: canFromApi, loading: permLoading } = usePermission(docId, paragraphId);

  const hasPermission = permissionData
    ? canFromData(paragraphId || 'document', action)
    : canFromApi(action);
  const loading = !permissionData && permLoading;

  if (loading) {
    return <span className="opacity-50">{children}</span>;
  }

  if (!hasPermission) {
    if (hideWhenDenied) {
      return <>{fallback}</>;
    }

    if (disableWhenDenied) {
      const title = showTooltip ? `No permission to ${action}` : undefined;
      return (
        <span className="opacity-50 cursor-not-allowed" title={title} aria-disabled>
          {children}
        </span>
      );
    }
  }

  return <>{children}</>;
}

interface PermissionButtonProps {
  docId: string;
  paragraphId?: string;
  action: PermissionAction;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  permissionData?: Record<string, EffectivePermission>;
}

export function PermissionButton({
  docId,
  paragraphId,
  action,
  onClick,
  children,
  className = '',
  disabled = false,
  permissionData,
}: PermissionButtonProps) {
  const { can: canFromData } = usePermissionsFromData(permissionData || {});
  const { can: canFromApi, loading: permLoading } = usePermission(docId, paragraphId);

  const hasPermission = permissionData
    ? canFromData(paragraphId || 'document', action)
    : canFromApi(action);
  const loading = !permissionData && permLoading;

  const isDisabled = disabled || loading || !hasPermission;
  const title = !hasPermission && !loading ? `No permission to ${action}` : undefined;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={`${className} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

export function UserContextPanel({ compact = false }: { compact?: boolean }) {
  const { userContext, updateUserContext } = useUserContext();
  const [expanded, setExpanded] = useState(false);

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {userContext.name || 'Guest'}
          {userContext.isAdmin && <span className="text-xs text-amber-600">(管理员)</span>}
        </button>
        {expanded && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-lg border border-slate-200 p-4 shadow-lg">
              <h3 className="text-sm font-medium text-slate-700 mb-3">用户上下文</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-slate-600 mb-1">用户ID</label>
                  <input
                    type="text"
                    value={userContext.userId || ''}
                    onChange={(e) => updateUserContext({ userId: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="user_123"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">邮箱</label>
                  <input
                    type="email"
                    value={userContext.email || ''}
                    onChange={(e) => updateUserContext({ email: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">姓名</label>
                  <input
                    type="text"
                    value={userContext.name || ''}
                    onChange={(e) => updateUserContext({ name: e.target.value || 'Guest' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="Guest"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">用户组</label>
                  <input
                    type="text"
                    value={userContext.groups?.join(', ') || ''}
                    onChange={(e) =>
                      updateUserContext({
                        groups: e.target.value ? e.target.value.split(',').map((g) => g.trim()) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="project-a, project-b"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">角色</label>
                  <input
                    type="text"
                    value={userContext.roles?.join(', ') || ''}
                    onChange={(e) =>
                      updateUserContext({
                        roles: e.target.value ? e.target.value.split(',').map((r) => r.trim()) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="admin, reviewer"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userContext.isAdmin || false}
                      onChange={(e) => updateUserContext({ isAdmin: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-slate-600">管理员</span>
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <h3 className="text-sm font-medium text-slate-700 mb-3">用户上下文</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-slate-600 mb-1">用户ID</label>
          <input
            type="text"
            value={userContext.userId || ''}
            onChange={(e) => updateUserContext({ userId: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="user_123"
          />
        </div>
        <div>
          <label className="block text-slate-600 mb-1">邮箱</label>
          <input
            type="email"
            value={userContext.email || ''}
            onChange={(e) => updateUserContext({ email: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="block text-slate-600 mb-1">姓名</label>
          <input
            type="text"
            value={userContext.name || ''}
            onChange={(e) => updateUserContext({ name: e.target.value || 'Guest' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="Guest"
          />
        </div>
        <div>
          <label className="block text-slate-600 mb-1">用户组</label>
          <input
            type="text"
            value={userContext.groups?.join(', ') || ''}
            onChange={(e) =>
              updateUserContext({
                groups: e.target.value ? e.target.value.split(',').map((g) => g.trim()) : undefined,
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="project-a, project-b"
          />
        </div>
        <div>
          <label className="block text-slate-600 mb-1">角色</label>
          <input
            type="text"
            value={userContext.roles?.join(', ') || ''}
            onChange={(e) =>
              updateUserContext({
                roles: e.target.value ? e.target.value.split(',').map((r) => r.trim()) : undefined,
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="admin, reviewer"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userContext.isAdmin || false}
              onChange={(e) => updateUserContext({ isAdmin: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-slate-600">管理员</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function useUserContext() {
  const [userContext, setLocalUserContext] = useState<Partial<UserContext>>(() => getUserContext());

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

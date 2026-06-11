import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Users, Globe, UserCheck, Building2, Copy, AlertTriangle, Download, Shield, Bell, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  DocumentPermission,
  ParagraphPermission,
  PermissionRule,
  PermissionSubjectType,
  PermissionAction,
  PermissionTemplate,
  AuditLogEntry,
  Paragraph,
  PermissionAlertConfig,
  AlertNotification,
} from '../types';
import { permissionsApi, shareApi, documentsApi } from '../utils/api';

interface PermissionManagerProps {
  docId: string;
  paragraphs?: Paragraph[];
}

const subjectTypeOptions: { value: PermissionSubjectType; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'everyone', label: '所有人', icon: Globe },
  { value: 'user', label: '用户', icon: UserCheck },
  { value: 'group', label: '用户组', icon: Users },
  { value: 'role', label: '角色', icon: Building2 },
  { value: 'domain', label: '邮箱域名', icon: Globe },
];

const actionOptions: { value: PermissionAction; label: string }[] = [
  { value: 'read', label: '阅读' },
  { value: 'edit', label: '编辑' },
  { value: 'comment', label: '评论' },
  { value: 'annotate', label: '批注' },
  { value: 'share', label: '分享' },
  { value: 'admin', label: '管理' },
];

const severityOptions: { value: string; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '严重' },
];

export function PermissionManager({ docId, paragraphs = [] }: PermissionManagerProps) {
  const [activeTab, setActiveTab] = useState<'document' | 'paragraph' | 'templates' | 'audit' | 'alerts'>('document');
  const [permission, setPermission] = useState<DocumentPermission | null>(null);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditStats, setAuditStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<PermissionRule> | null>(null);
  const [shareLinks, setShareLinks] = useState<any[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');
  const [alertConfig, setAlertConfig] = useState<PermissionAlertConfig | null>(null);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [perm, tpls, links] = await Promise.all([
        permissionsApi.getDocumentPermission(docId),
        permissionsApi.getTemplates(),
        shareApi.getByDocId(docId),
      ]);
      setPermission(perm);
      setTemplates(tpls);
      setShareLinks(links);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const [logs, stats] = await Promise.all([
        permissionsApi.getAuditLogs(docId, { limit: 100 }),
        permissionsApi.getAuditStatistics(docId),
      ]);
      setAuditLogs(logs);
      setAuditStats(stats);
    } catch {
      // ignore
    }
  }, [docId]);

  const loadAlertData = useCallback(async () => {
    try {
      const [config, alertList] = await Promise.all([
        permissionsApi.getAlertConfig(docId),
        permissionsApi.getAlerts(docId),
      ]);
      setAlertConfig(config);
      setAlerts(alertList);
    } catch {
      // ignore
    }
  }, [docId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
    if (activeTab === 'alerts') {
      loadAlertData();
    }
  }, [activeTab, loadAuditLogs, loadAlertData]);

  const handleAddRule = async (scope: 'document' | 'paragraph', paragraphId?: string) => {
    if (!editingRule || !editingRule.subjectType || !editingRule.actions) return;

    try {
      if (scope === 'document') {
        const perm = await permissionsApi.addDefaultRule(docId, {
          subjectType: editingRule.subjectType,
          subjectValue: editingRule.subjectValue || '*',
          actions: editingRule.actions,
          deny: editingRule.deny,
          priority: editingRule.priority,
        });
        setPermission(perm);
      } else if (paragraphId) {
        const paragraphPerm = permission?.paragraphPermissions.find((p) => p.paragraphId === paragraphId);
        const rules = paragraphPerm ? [...paragraphPerm.rules, editingRule as PermissionRule] : [editingRule as PermissionRule];
        const perm = await permissionsApi.setParagraphPermission(
          docId,
          paragraphId,
          rules.map((r) => ({
            subjectType: r.subjectType,
            subjectValue: r.subjectValue,
            actions: r.actions,
            deny: r.deny,
            priority: r.priority,
          })),
          paragraphPerm?.inheritFromDocument !== false
        );
        setPermission(perm);
      }
      setEditingRule(null);
    } catch (e) {
      console.error('Failed to add rule:', e);
    }
  };

  const handleSetSectionPermission = async (headingParagraphId: string, headingLevel: number) => {
    if (!editingRule || !editingRule.actions) return;
    try {
      const existingPerm = permission?.paragraphPermissions.find((p) => p.paragraphId === headingParagraphId);
      const rules = existingPerm ? [...existingPerm.rules, editingRule as PermissionRule] : [editingRule as PermissionRule];
      const perm = await permissionsApi.setSectionPermission(docId, headingParagraphId, {
        rules: rules.map((r) => ({
          subjectType: r.subjectType,
          subjectValue: r.subjectValue,
          actions: r.actions,
          deny: r.deny,
          priority: r.priority,
        })),
        headingLevel,
        cascadeToChildren: true,
        inheritFromDocument: existingPerm?.inheritFromDocument !== false,
      });
      setPermission(perm);
      setEditingRule(null);
    } catch (e) {
      console.error('Failed to set section permission:', e);
    }
  };

  const handleRemoveRule = async (ruleId: string, paragraphId?: string) => {
    try {
      if (paragraphId) {
        const paragraphPerm = permission?.paragraphPermissions.find((p) => p.paragraphId === paragraphId);
        if (paragraphPerm) {
          const rules = paragraphPerm.rules.filter((r) => r.id !== ruleId);
          const perm = await permissionsApi.setParagraphPermission(
            docId,
            paragraphId,
            rules.map((r) => ({
              subjectType: r.subjectType,
              subjectValue: r.subjectValue,
              actions: r.actions,
              deny: r.deny,
              priority: r.priority,
            })),
            paragraphPerm.inheritFromDocument !== false
          );
          setPermission(perm);
        }
      } else {
        const perm = await permissionsApi.removeDefaultRule(docId, ruleId);
        setPermission(perm);
      }
    } catch (e) {
      console.error('Failed to remove rule:', e);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    try {
      const result = await permissionsApi.applyTemplate(templateId, docId);
      setPermission(result.permission);
      alert('模板已应用');
    } catch (e) {
      console.error('Failed to apply template:', e);
    }
  };

  const handleCreateShareLink = async () => {
    try {
      const result = await documentsApi.createShare(docId, {
        password: sharePassword || undefined,
        expiresAt: shareExpiry || undefined,
      });
      setShareLinks([...shareLinks, result]);
      setShowShareModal(false);
      setSharePassword('');
      setShareExpiry('');
      alert(`分享链接已创建：${result.token}`);
    } catch (e) {
      console.error('Failed to create share link:', e);
    }
  };

  const handleRevokeShare = async (token: string) => {
    if (!confirm('确定要撤销此分享链接吗？')) return;
    try {
      await shareApi.revoke(token);
      setShareLinks(shareLinks.filter((l) => l.token !== token));
    } catch (e) {
      console.error('Failed to revoke share:', e);
    }
  };

  const handleCreateTemplateFromDocument = async () => {
    const name = prompt('请输入模板名称：');
    if (!name) return;
    const description = prompt('请输入模板描述（可选）：') || undefined;

    try {
      const template = await permissionsApi.createTemplateFromDocument(docId, { name, description });
      setTemplates([...templates, template]);
      alert('模板已创建');
    } catch (e) {
      console.error('Failed to create template:', e);
    }
  };

  const handleSaveAlertConfig = async () => {
    if (!alertConfig) return;
    try {
      const updated = await permissionsApi.setAlertConfig(docId, alertConfig);
      setAlertConfig(updated);
      alert('告警配置已保存');
    } catch (e) {
      console.error('Failed to save alert config:', e);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await permissionsApi.acknowledgeAlert(docId, alertId);
      await loadAlertData();
    } catch (e) {
      console.error('Failed to acknowledge alert:', e);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await permissionsApi.resolveAlert(docId, alertId);
      await loadAlertData();
    } catch (e) {
      console.error('Failed to resolve alert:', e);
    }
  };

  const headings = paragraphs.filter((p) => p.type === 'heading');

  if (loading) {
    return <div className="p-4 text-center text-slate-500">加载中...</div>;
  }

  if (!permission) {
    return <div className="p-4 text-center text-slate-500">无法加载权限配置</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="border-b border-slate-200">
        <nav className="flex -mb-px">
          {[
            { key: 'document', label: '文档级权限' },
            { key: 'paragraph', label: '段落级权限' },
            { key: 'templates', label: '权限模板' },
            { key: 'audit', label: '审计日志' },
            { key: 'alerts', label: '告警管理' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setShowShareModal(true)}
            className="ml-auto px-5 py-3 text-sm font-medium text-sky-600 hover:text-sky-700"
          >
            <span className="flex items-center gap-2">
              <Copy size={16} />
              生成分享链接
            </span>
          </button>
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'document' && (
          <DocumentRules
            permission={permission}
            editingRule={editingRule}
            setEditingRule={setEditingRule}
            onAddRule={() => handleAddRule('document')}
            onRemoveRule={(id) => handleRemoveRule(id)}
          />
        )}

        {activeTab === 'paragraph' && (
          <ParagraphRules
            permission={permission}
            paragraphs={paragraphs}
            headings={headings}
            selectedParagraphId={selectedParagraphId}
            setSelectedParagraphId={setSelectedParagraphId}
            editingRule={editingRule}
            setEditingRule={setEditingRule}
            onAddRule={(pid) => handleAddRule('paragraph', pid)}
            onRemoveRule={(rid, pid) => handleRemoveRule(rid, pid)}
            onSetParagraphPermission={async (pid, rules, inherit) => {
              const perm = await permissionsApi.setParagraphPermission(
                docId,
                pid,
                rules.map((r) => ({
                  subjectType: r.subjectType,
                  subjectValue: r.subjectValue,
                  actions: r.actions,
                  deny: r.deny,
                  priority: r.priority,
                })),
                inherit
              );
              setPermission(perm);
            }}
            onRemoveParagraphPermission={async (pid) => {
              const perm = await permissionsApi.removeParagraphPermission(docId, pid);
              setPermission(perm);
            }}
            onSetSectionPermission={handleSetSectionPermission}
          />
        )}

        {activeTab === 'templates' && (
          <TemplateManager
            templates={templates}
            onApplyTemplate={handleApplyTemplate}
            onCreateFromDocument={handleCreateTemplateFromDocument}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogViewer logs={auditLogs} stats={auditStats} onRefresh={loadAuditLogs} />
        )}

        {activeTab === 'alerts' && (
          <AlertManager
            alertConfig={alertConfig}
            alerts={alerts}
            onAlertConfigChange={setAlertConfig}
            onSaveAlertConfig={handleSaveAlertConfig}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onResolveAlert={handleResolveAlert}
          />
        )}
      </div>

      {shareLinks.length > 0 && (
        <div className="border-t border-slate-200 p-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">分享链接 ({shareLinks.length})</h3>
          <div className="space-y-2">
            {shareLinks.map((link) => (
              <div key={link.token} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <code className="text-sm text-slate-600">{link.token}</code>
                  <div className="text-xs text-slate-400 mt-1">
                    创建于 {new Date(link.createdAt).toLocaleString()}
                    {link.expiresAt && ` · 过期于 ${new Date(link.expiresAt).toLocaleString()}`}
                    {link.hasPassword && ' · 密码保护'}
                    <span className="ml-2 text-sky-500">· 含权限快照</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeShare(link.token)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="撤销"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-slate-800 mb-4">生成分享链接</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">访问密码（可选）</label>
                <input
                  type="text"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  placeholder="留空则无密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">过期时间（可选）</label>
                <input
                  type="datetime-local"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="p-3 bg-sky-50 rounded-md border border-sky-200">
                <div className="flex items-center gap-2 text-sm text-sky-700">
                  <Shield size={16} />
                  <span className="font-medium">权限快照保护</span>
                </div>
                <p className="text-xs text-sky-600 mt-1">
                  分享链接将嵌入当前权限快照，后续权限变更不会影响已分享的链接
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateShareLink}
                  className="px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600"
                >
                  生成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentRules({
  permission,
  editingRule,
  setEditingRule,
  onAddRule,
  onRemoveRule,
}: {
  permission: DocumentPermission;
  editingRule: Partial<PermissionRule> | null;
  setEditingRule: (rule: Partial<PermissionRule> | null) => void;
  onAddRule: () => void;
  onRemoveRule: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700">默认权限规则</h3>
        <button
          onClick={() =>
            setEditingRule({
              subjectType: 'everyone',
              subjectValue: '*',
              actions: ['read'],
              deny: false,
              priority: 0,
            })
          }
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-sky-50 text-sky-600 rounded-md hover:bg-sky-100"
        >
          <Plus size={14} />
          添加规则
        </button>
      </div>

      <div className="space-y-3">
        {permission.defaultRules.length === 0 && (
          <div className="text-center py-8 text-slate-400">暂无规则</div>
        )}
        {permission.defaultRules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} onRemove={() => onRemoveRule(rule.id)} />
        ))}
      </div>

      {editingRule && (
        <RuleEditor
          rule={editingRule}
          onChange={setEditingRule}
          onSave={onAddRule}
          onCancel={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}

function ParagraphRules({
  permission,
  paragraphs,
  headings,
  selectedParagraphId,
  setSelectedParagraphId,
  editingRule,
  setEditingRule,
  onAddRule,
  onRemoveRule,
  onSetParagraphPermission,
  onRemoveParagraphPermission,
  onSetSectionPermission,
}: {
  permission: DocumentPermission;
  paragraphs: Paragraph[];
  headings: Paragraph[];
  selectedParagraphId: string | null;
  setSelectedParagraphId: (id: string | null) => void;
  editingRule: Partial<PermissionRule> | null;
  setEditingRule: (rule: Partial<PermissionRule> | null) => void;
  onAddRule: (paragraphId: string) => void;
  onRemoveRule: (ruleId: string, paragraphId: string) => void;
  onSetParagraphPermission: (
    paragraphId: string,
    rules: PermissionRule[],
    inherit: boolean
  ) => void;
  onRemoveParagraphPermission: (paragraphId: string) => void;
  onSetSectionPermission: (headingParagraphId: string, headingLevel: number) => void;
}) {
  const [viewMode, setViewMode] = useState<'all' | 'headings'>('headings');
  const [expandedHeadings, setExpandedHeadings] = useState<Set<string>>(new Set());

  const selectedParagraphPerm = permission.paragraphPermissions.find(
    (p) => p.paragraphId === selectedParagraphId
  );

  const getChildParagraphs = (heading: Paragraph): Paragraph[] => {
    const startIdx = paragraphs.findIndex((p) => p.id === heading.id);
    const children: Paragraph[] = [];
    for (let i = startIdx + 1; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.type === 'heading' && (p.level || 1) <= (heading.level || 1)) break;
      children.push(p);
    }
    return children;
  };

  const toggleHeading = (id: string) => {
    const next = new Set(expandedHeadings);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedHeadings(next);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700">段落级权限</h3>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('headings')}
              className={`px-3 py-1 text-xs ${viewMode === 'headings' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600'}`}
            >
              章节视图
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 text-xs ${viewMode === 'all' ? 'bg-sky-500 text-white' : 'bg-white text-slate-600'}`}
            >
              全部段落
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'headings' ? (
        <div className="space-y-2">
          {headings.length === 0 && (
            <div className="text-center py-8 text-slate-400">文档中没有标题段落</div>
          )}
          {headings.map((heading) => {
            const isExpanded = expandedHeadings.has(heading.id);
            const sectionPerm = permission.paragraphPermissions.find((p) => p.paragraphId === heading.id);
            const children = getChildParagraphs(heading);
            const childrenWithPerms = children.filter((c) =>
              permission.paragraphPermissions.some((pp) => pp.paragraphId === c.id)
            );

            return (
              <div key={heading.id} className="border border-slate-200 rounded-lg">
                <div
                  className={`flex items-center gap-2 p-3 cursor-pointer hover:bg-slate-50 ${
                    sectionPerm?.isSection ? 'bg-sky-50' : ''
                  }`}
                  onClick={() => {
                    toggleHeading(heading.id);
                    setSelectedParagraphId(heading.id);
                  }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {heading.content.replace(/^#+\s*/, '')}
                    </div>
                    <div className="text-xs text-slate-400">
                      H{heading.level} · {children.length} 个子段落
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sectionPerm?.isSection && (
                      <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded flex items-center gap-1">
                        <Layers size={10} />
                        章节级{sectionPerm.cascadeToChildren ? ' (级联)' : ''}
                      </span>
                    )}
                    {sectionPerm ? (
                      <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">已配置</span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedParagraphId(heading.id);
                          onSetSectionPermission(heading.id, heading.level || 1);
                        }}
                        className="text-xs bg-sky-50 text-sky-600 px-2 py-0.5 rounded hover:bg-sky-100"
                      >
                        设为章节权限
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-3 pl-10">
                    {sectionPerm && (
                      <div className="mb-3 p-3 bg-white rounded-md border border-slate-200">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-slate-600">章节权限规则</span>
                          <div className="flex gap-2">
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={sectionPerm.cascadeToChildren !== false}
                                onChange={(e) => {
                                  onSetParagraphPermission(
                                    sectionPerm.paragraphId,
                                    sectionPerm.rules,
                                    sectionPerm.inheritFromDocument !== false
                                  );
                                }}
                                className="w-3 h-3"
                              />
                              级联到子段落
                            </label>
                          </div>
                        </div>
                        {sectionPerm.rules.map((rule) => (
                          <RuleCard
                            key={rule.id}
                            rule={rule}
                            onRemove={() => onRemoveRule(rule.id, sectionPerm.paragraphId)}
                            compact
                          />
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 mb-2">子段落 ({childrenWithPerms.length}/{children.length} 有自定义权限)</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {children.map((child) => {
                        const childPerm = permission.paragraphPermissions.find((p) => p.paragraphId === child.id);
                        return (
                          <div
                            key={child.id}
                            onClick={() => setSelectedParagraphId(child.id)}
                            className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer hover:bg-slate-50 ${
                              selectedParagraphId === child.id ? 'bg-sky-50 text-sky-700' : 'text-slate-500'
                            }`}
                          >
                            <span className="truncate">{child.content.slice(0, 30)}</span>
                            {childPerm && <span className="text-xs bg-sky-100 text-sky-600 px-1 rounded">自定义</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 border-r border-slate-200 pr-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">段落列表</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {paragraphs.map((p) => {
                const hasPerm = permission.paragraphPermissions.some(
                  (pp) => pp.paragraphId === p.id
                );
                const pp = permission.paragraphPermissions.find((pp) => pp.paragraphId === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedParagraphId(p.id)}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                      selectedParagraphId === p.id
                        ? 'bg-sky-50 text-sky-700'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate">
                        {p.type === 'heading'
                          ? p.content.replace(/^#+\s*/, '').slice(0, 20)
                          : p.content.slice(0, 20)}
                      </span>
                      {hasPerm && (
                        <span className={`text-xs px-1 rounded ${pp?.isSection ? 'bg-sky-100 text-sky-600' : 'bg-green-100 text-green-600'}`}>
                          {pp?.isSection ? '章节' : '已配置'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-2 pl-4">
            {selectedParagraphId ? (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-medium text-slate-700">
                    段落 {selectedParagraphId.slice(-6)} 权限
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setEditingRule({
                          subjectType: 'everyone',
                          subjectValue: '*',
                          actions: ['read'],
                          deny: false,
                          priority: 0,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-sky-50 text-sky-600 rounded-md hover:bg-sky-100"
                    >
                      <Plus size={14} />
                      添加规则
                    </button>
                    {selectedParagraphPerm && (
                      <button
                        onClick={() => {
                          if (confirm('确定要移除此段落的权限配置吗？')) {
                            onRemoveParagraphPermission(selectedParagraphId);
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100"
                      >
                        <Trash2 size={14} />
                        移除配置
                      </button>
                    )}
                  </div>
                </div>

                {selectedParagraphPerm && (
                  <div className="mb-4 space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedParagraphPerm.inheritFromDocument !== false}
                        onChange={(e) =>
                          onSetParagraphPermission(
                            selectedParagraphId,
                            selectedParagraphPerm.rules,
                            e.target.checked
                          )
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-slate-600">继承文档级权限</span>
                    </label>
                    {selectedParagraphPerm.isSection && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedParagraphPerm.cascadeToChildren !== false}
                          onChange={(e) =>
                            onSetParagraphPermission(
                              selectedParagraphId,
                              selectedParagraphPerm.rules,
                              selectedParagraphPerm.inheritFromDocument !== false
                            )
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-600 flex items-center gap-1">
                          <Layers size={14} />
                          级联到子段落
                        </span>
                      </label>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {(!selectedParagraphPerm || selectedParagraphPerm.rules.length === 0) && (
                    <div className="text-center py-8 text-slate-400">暂无段落级规则</div>
                  )}
                  {selectedParagraphPerm?.rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onRemove={() => onRemoveRule(rule.id, selectedParagraphId)}
                    />
                  ))}
                </div>

                {editingRule && (
                  <RuleEditor
                    rule={editingRule}
                    onChange={setEditingRule}
                    onSave={() => onAddRule(selectedParagraphId)}
                    onCancel={() => setEditingRule(null)}
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400">请选择一个段落</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule, onRemove, compact = false }: { rule: PermissionRule; onRemove: () => void; compact?: boolean }) {
  const Icon = subjectTypeOptions.find((o) => o.value === rule.subjectType)?.icon || Globe;
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${rule.deny ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} ${compact ? 'p-2' : ''}`}>
      <div className="flex items-center gap-3">
        <Icon size={18} className={rule.deny ? 'text-red-500' : 'text-slate-500'} />
        <div>
          <div className="text-sm font-medium text-slate-700">
            {subjectTypeOptions.find((o) => o.value === rule.subjectType)?.label}
            {rule.subjectValue !== '*' && `: ${rule.subjectValue}`}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {rule.deny ? '禁止：' : '允许：'}
            {rule.actions.map((a) => actionOptions.find((o) => o.value === a)?.label).join('、')}
            {rule.priority !== undefined && ` · 优先级 ${rule.priority}`}
          </div>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-slate-400 hover:text-red-500 p-1"
        title="删除"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onSave,
  onCancel,
}: {
  rule: Partial<PermissionRule>;
  onChange: (rule: Partial<PermissionRule> | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [selectedActions, setSelectedActions] = useState<PermissionAction[]>(rule.actions || []);

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">主体类型</label>
          <select
            value={rule.subjectType || 'everyone'}
            onChange={(e) => onChange({ ...rule, subjectType: e.target.value as PermissionSubjectType })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            {subjectTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">主体值</label>
          <input
            type="text"
            value={rule.subjectValue || '*'}
            onChange={(e) => onChange({ ...rule, subjectValue: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="* 或 user@example.com 等"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
          <input
            type="number"
            value={rule.priority ?? 0}
            onChange={(e) => onChange({ ...rule, priority: parseInt(e.target.value, 10) })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">规则类型</label>
          <select
            value={rule.deny ? 'deny' : 'allow'}
            onChange={(e) => onChange({ ...rule, deny: e.target.value === 'deny' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            <option value="allow">允许</option>
            <option value="deny">拒绝</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">操作权限</label>
        <div className="flex flex-wrap gap-2">
          {actionOptions.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedActions.includes(opt.value)}
                onChange={(e) => {
                  const newActions = e.target.checked
                    ? [...selectedActions, opt.value]
                    : selectedActions.filter((a) => a !== opt.value);
                  setSelectedActions(newActions);
                  onChange({ ...rule, actions: newActions });
                }}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-600">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
        >
          取消
        </button>
        <button
          onClick={onSave}
          disabled={selectedActions.length === 0}
          className="flex items-center gap-1 px-4 py-2 text-sm bg-sky-500 text-white rounded-md hover:bg-sky-600 disabled:opacity-50"
        >
          <Save size={14} />
          保存
        </button>
      </div>
    </div>
  );
}

function TemplateManager({
  templates,
  onApplyTemplate,
  onCreateFromDocument,
  onRefresh,
}: {
  templates: PermissionTemplate[];
  onApplyTemplate: (id: string) => void;
  onCreateFromDocument: () => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700">权限模板</h3>
        <div className="flex gap-2">
          <button
            onClick={onCreateFromDocument}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-md hover:bg-green-100"
          >
            <Download size={14} />
            从当前文档创建
          </button>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100"
          >
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className="p-4 border border-slate-200 rounded-lg hover:border-sky-300 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-medium text-slate-800">{template.name}</h4>
                {template.description && (
                  <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                )}
              </div>
              {template.id.startsWith('builtin_') && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">内置</span>
              )}
            </div>
            <div className="text-xs text-slate-400 mb-2">
              {template.defaultRules.length} 条默认规则
              {template.paragraphPermissionPatterns && template.paragraphPermissionPatterns.length > 0 &&
                ` · ${template.paragraphPermissionPatterns.length} 条段落模式`}
              {' · '}更新于 {new Date(template.updatedAt).toLocaleDateString()}
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {template.defaultRules.slice(0, 3).map((rule) => (
                <span
                  key={rule.id}
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    rule.deny ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-600'
                  }`}
                >
                  {subjectTypeOptions.find((o) => o.value === rule.subjectType)?.label}
                </span>
              ))}
              {template.defaultRules.length > 3 && (
                <span className="text-xs text-slate-400">+{template.defaultRules.length - 3}</span>
              )}
            </div>
            {template.paragraphPermissionPatterns && template.paragraphPermissionPatterns.length > 0 && (
              <div className="mb-3 p-2 bg-sky-50 rounded text-xs text-sky-700">
                <span className="font-medium">段落模式：</span>
                {template.paragraphPermissionPatterns.map((p, i) => (
                  <span key={i} className="ml-2">
                    {p.pattern === 'heading-level' ? `H${p.headingLevel}级标题` :
                     p.pattern === 'paragraph-type' ? p.paragraphType :
                     p.pattern === 'first-n' ? `前${p.count}段` : '自定义'}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => onApplyTemplate(template.id)}
              className="w-full px-3 py-1.5 text-sm bg-sky-50 text-sky-600 rounded-md hover:bg-sky-100"
            >
              应用到当前文档
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLogViewer({
  logs,
  stats,
  onRefresh,
}: {
  logs: AuditLogEntry[];
  stats: any;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700">审计日志</h3>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100"
        >
          刷新
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="总访问" value={stats.total} />
          <StatCard label="授权访问" value={stats.accessGranted} />
          <StatCard label="拒绝访问" value={stats.accessDenied} variant="danger" />
          <StatCard label="权限变更" value={stats.permissionChanged} />
          <StatCard label="告警触发" value={stats.alertTriggered || 0} variant="warning" />
        </div>
      )}

      {stats?.accessDenied > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="text-amber-500" size={20} />
          <div>
            <div className="text-sm font-medium text-amber-800">检测到 {stats.accessDenied} 次未授权访问尝试</div>
            <div className="text-xs text-amber-600">请检查是否存在安全风险，可在告警管理中配置告警阈值</div>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">时间</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">类型</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">操作</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">用户</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">段落</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  暂无日志
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className={log.type === 'access_denied' ? 'bg-red-50' : log.type === 'alert_triggered' ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2 text-slate-600 text-xs">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      log.type === 'access_denied'
                        ? 'bg-red-100 text-red-700'
                        : log.type === 'access_granted'
                        ? 'bg-green-100 text-green-700'
                        : log.type === 'permission_changed'
                        ? 'bg-amber-100 text-amber-700'
                        : log.type === 'alert_triggered'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{log.action || '-'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {log.userContext.name || log.userContext.email || 'anonymous'}
                </td>
                <td className="px-4 py-2 text-slate-500 text-xs">
                  {log.paragraphId ? log.paragraphId.slice(-8) : '-'}
                </td>
                <td className="px-4 py-2 text-slate-500 text-xs font-mono">
                  {log.ip || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertManager({
  alertConfig,
  alerts,
  onAlertConfigChange,
  onSaveAlertConfig,
  onAcknowledgeAlert,
  onResolveAlert,
}: {
  alertConfig: PermissionAlertConfig | null;
  alerts: AlertNotification[];
  onAlertConfigChange: (config: PermissionAlertConfig) => void;
  onSaveAlertConfig: () => void;
  onAcknowledgeAlert: (id: string) => void;
  onResolveAlert: (id: string) => void;
}) {
  const config = alertConfig || {
    enabled: true,
    accessDeniedThreshold: 5,
    accessDeniedWindowMinutes: 10,
    severity: 'medium' as const,
    escalationEnabled: true,
    escalationThreshold: 20,
    escalationSeverity: 'critical' as const,
  };

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const acknowledgedAlerts = alerts.filter((a) => a.status === 'acknowledged');

  return (
    <div>
      {activeAlerts.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-red-500" />
            <span className="font-medium text-red-800">{activeAlerts.length} 个活跃告警</span>
          </div>
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="p-3 bg-white rounded border border-red-200">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-red-800">{alert.message}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(alert.createdAt).toLocaleString()} · 严重程度：
                      <span className={`font-medium ${
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'high' ? 'text-orange-600' :
                        alert.severity === 'medium' ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {severityOptions.find(s => s.value === alert.severity)?.label || alert.severity}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAcknowledgeAlert(alert.id)}
                      className="text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100"
                    >
                      确认
                    </button>
                    <button
                      onClick={() => onResolveAlert(alert.id)}
                      className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                    >
                      解决
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {acknowledgedAlerts.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-amber-700 mb-2">已确认告警 ({acknowledgedAlerts.length})</h4>
          <div className="space-y-2">
            {acknowledgedAlerts.map((alert) => (
              <div key={alert.id} className="p-3 bg-amber-50 rounded border border-amber-200 flex justify-between items-center">
                <div>
                  <div className="text-sm text-amber-800">{alert.message}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    确认人：{alert.acknowledgedBy} · {alert.acknowledgedAt && new Date(alert.acknowledgedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => onResolveAlert(alert.id)}
                  className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                >
                  解决
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 border border-slate-200 rounded-lg">
        <h3 className="text-sm font-medium text-slate-700 mb-4 flex items-center gap-2">
          <Bell size={16} />
          告警配置
        </h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onAlertConfigChange({ ...config, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-600">启用越权访问告警</span>
          </label>

          {config.enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">拒绝访问阈值</label>
                  <input
                    type="number"
                    value={config.accessDeniedThreshold}
                    onChange={(e) => onAlertConfigChange({ ...config, accessDeniedThreshold: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    min={1}
                  />
                  <p className="text-xs text-slate-400 mt-1">在时间窗口内达到此数量触发告警</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">时间窗口（分钟）</label>
                  <input
                    type="number"
                    value={config.accessDeniedWindowMinutes}
                    onChange={(e) => onAlertConfigChange({ ...config, accessDeniedWindowMinutes: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">告警严重程度</label>
                  <select
                    value={config.severity}
                    onChange={(e) => onAlertConfigChange({ ...config, severity: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    {severityOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">通知邮箱</label>
                  <input
                    type="text"
                    value={config.notifyEmails?.join(', ') || ''}
                    onChange={(e) => onAlertConfigChange({
                      ...config,
                      notifyEmails: e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined,
                    })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    placeholder="admin@example.com, ops@example.com"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={config.escalationEnabled}
                    onChange={(e) => onAlertConfigChange({ ...config, escalationEnabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-600">启用升级机制</span>
                </label>

                {config.escalationEnabled && (
                  <div className="grid grid-cols-2 gap-4 ml-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">升级阈值</label>
                      <input
                        type="number"
                        value={config.escalationThreshold}
                        onChange={(e) => onAlertConfigChange({ ...config, escalationThreshold: parseInt(e.target.value, 10) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                        min={1}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">升级严重程度</label>
                      <select
                        value={config.escalationSeverity}
                        onChange={(e) => onAlertConfigChange({ ...config, escalationSeverity: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                      >
                        {severityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <button
              onClick={onSaveAlertConfig}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-sky-500 text-white rounded-md hover:bg-sky-600"
            >
              <Save size={14} />
              保存告警配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: 'default' | 'danger' | 'warning' }) {
  const colorClass = variant === 'danger' ? 'bg-red-50 border-red-200' : variant === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200';
  const valueClass = variant === 'danger' ? 'text-red-600' : variant === 'warning' ? 'text-amber-600' : 'text-slate-800';
  const labelClass = variant === 'danger' ? 'text-red-500' : variant === 'warning' ? 'text-amber-500' : 'text-slate-500';

  return (
    <div className={`p-4 rounded-lg border ${colorClass}`}>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className={`text-sm ${labelClass}`}>{label}</div>
    </div>
  );
}

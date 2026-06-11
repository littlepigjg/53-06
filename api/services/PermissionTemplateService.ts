import type { PermissionTemplate, PermissionRule, UserContext, ParagraphPermissionPattern, Paragraph } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import { PermissionService } from './PermissionService.js';

function genTemplateId() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class PermissionTemplateService {
  static async list(): Promise<PermissionTemplate[]> {
    const templates = await FileStorageService.readJson<PermissionTemplate[]>(
      FileStorageService.getTemplatesPath(),
      []
    );
    return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  static async get(id: string): Promise<PermissionTemplate | null> {
    const templates = await this.list();
    return templates.find((t) => t.id === id) || null;
  }

  static async create(
    data: {
      name: string;
      description?: string;
      defaultRules: Omit<PermissionRule, 'id'>[];
      paragraphPermissionPatterns?: ParagraphPermissionPattern[];
    },
    _userContext?: UserContext
  ): Promise<PermissionTemplate> {
    const now = new Date().toISOString();
    const template: PermissionTemplate = {
      id: genTemplateId(),
      name: data.name,
      description: data.description,
      defaultRules: data.defaultRules.map((r) => ({ ...r, id: genRuleId() })),
      paragraphPermissionPatterns: data.paragraphPermissionPatterns,
      createdAt: now,
      updatedAt: now,
    };

    const templates = await FileStorageService.readJson<PermissionTemplate[]>(
      FileStorageService.getTemplatesPath(),
      []
    );
    templates.push(template);
    await FileStorageService.writeJson(FileStorageService.getTemplatesPath(), templates);

    return template;
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      defaultRules?: Omit<PermissionRule, 'id'>[];
      paragraphPermissionPatterns?: ParagraphPermissionPattern[];
    },
    _userContext?: UserContext
  ): Promise<PermissionTemplate | null> {
    const templates = await FileStorageService.readJson<PermissionTemplate[]>(
      FileStorageService.getTemplatesPath(),
      []
    );
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) return null;

    const template = templates[idx];
    if (data.name !== undefined) template.name = data.name;
    if (data.description !== undefined) template.description = data.description;
    if (data.defaultRules !== undefined) {
      template.defaultRules = data.defaultRules.map((r) => ({ ...r, id: genRuleId() }));
    }
    if (data.paragraphPermissionPatterns !== undefined) {
      template.paragraphPermissionPatterns = data.paragraphPermissionPatterns;
    }
    template.updatedAt = new Date().toISOString();

    await FileStorageService.writeJson(FileStorageService.getTemplatesPath(), templates);
    return template;
  }

  static async remove(id: string): Promise<boolean> {
    const templates = await FileStorageService.readJson<PermissionTemplate[]>(
      FileStorageService.getTemplatesPath(),
      []
    );
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) return false;

    templates.splice(idx, 1);
    await FileStorageService.writeJson(FileStorageService.getTemplatesPath(), templates);
    return true;
  }

  static async applyToDocument(templateId: string, docId: string, paragraphs?: Paragraph[]): Promise<boolean> {
    const template = await this.get(templateId);
    if (!template) {
      const builtin = await this.getBuiltinTemplates();
      const builtinTemplate = builtin.find((t) => t.id === templateId);
      if (!builtinTemplate) return false;
      return this.applyTemplateToDocument(builtinTemplate, docId, paragraphs);
    }
    return this.applyTemplateToDocument(template, docId, paragraphs);
  }

  private static async applyTemplateToDocument(
    template: PermissionTemplate,
    docId: string,
    paragraphs?: Paragraph[]
  ): Promise<boolean> {
    const perm = await PermissionService.getOrCreateDocumentPermission(docId);
    perm.defaultRules = template.defaultRules.map((r) => ({ ...r, id: genRuleId() }));

    if (template.paragraphPermissionPatterns && paragraphs && paragraphs.length > 0) {
      const items: { paragraphId: string; rules: Omit<PermissionRule, 'id'>[]; inheritFromDocument?: boolean }[] = [];

      for (const pattern of template.paragraphPermissionPatterns) {
        const matchingParagraphs = this.matchPattern(pattern, paragraphs);
        for (const p of matchingParagraphs) {
          items.push({
            paragraphId: p.id,
            rules: pattern.rules,
            inheritFromDocument: pattern.inheritFromDocument,
          });
        }
      }

      if (items.length > 0) {
        await PermissionService.batchSetParagraphPermissions(docId, items);
        return true;
      }
    }

    await PermissionService.saveDocumentPermission(perm);
    return true;
  }

  static matchPattern(pattern: ParagraphPermissionPattern, paragraphs: Paragraph[]): Paragraph[] {
    switch (pattern.pattern) {
      case 'heading-level': {
        return paragraphs.filter(
          (p) => p.type === 'heading' && p.level === pattern.headingLevel
        );
      }
      case 'paragraph-type': {
        return paragraphs.filter(
          (p) => p.type === pattern.paragraphType
        );
      }
      case 'first-n': {
        return paragraphs.slice(0, pattern.count || 1);
      }
      case 'custom': {
        return paragraphs;
      }
      default:
        return [];
    }
  }

  static async createFromDocument(
    docId: string,
    data: {
      name: string;
      description?: string;
    },
    userContext?: UserContext
  ): Promise<PermissionTemplate | null> {
    const perm = await PermissionService.getDocumentPermission(docId);
    if (!perm) return null;

    return this.create(
      {
        name: data.name,
        description: data.description,
        defaultRules: perm.defaultRules.map((r) => ({
          subjectType: r.subjectType,
          subjectValue: r.subjectValue,
          actions: r.actions,
          deny: r.deny,
          priority: r.priority,
        })),
      },
      userContext
    );
  }

  static async getBuiltinTemplates(): Promise<PermissionTemplate[]> {
    const now = new Date().toISOString();
    return [
      {
        id: 'builtin_internal_only',
        name: '仅内部可见',
        description: '仅公司内部员工可阅读，管理员可编辑',
        defaultRules: [
          {
            id: 'rule_builtin_1',
            subjectType: 'domain',
            subjectValue: '@company.com',
            actions: ['read'],
            priority: 10,
          },
          {
            id: 'rule_builtin_2',
            subjectType: 'role',
            subjectValue: 'admin',
            actions: ['read', 'edit', 'comment', 'annotate', 'share', 'admin'],
            priority: 100,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_public_readonly',
        name: '公开只读',
        description: '所有人可阅读，不可编辑',
        defaultRules: [
          {
            id: 'rule_builtin_3',
            subjectType: 'everyone',
            subjectValue: '*',
            actions: ['read'],
            priority: 0,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_confidential',
        name: '机密文档',
        description: '仅管理员和项目组A可见',
        defaultRules: [
          {
            id: 'rule_builtin_4',
            subjectType: 'group',
            subjectValue: 'project-a',
            actions: ['read', 'comment'],
            priority: 10,
          },
          {
            id: 'rule_builtin_5',
            subjectType: 'role',
            subjectValue: 'admin',
            actions: ['read', 'edit', 'comment', 'annotate', 'share', 'admin'],
            priority: 100,
          },
          {
            id: 'rule_builtin_6',
            subjectType: 'everyone',
            subjectValue: '*',
            actions: ['read'],
            deny: true,
            priority: 1,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_collaborative',
        name: '协作模式',
        description: '所有人可阅读和批注，管理员可编辑',
        defaultRules: [
          {
            id: 'rule_builtin_7',
            subjectType: 'everyone',
            subjectValue: '*',
            actions: ['read', 'comment', 'annotate'],
            priority: 0,
          },
          {
            id: 'rule_builtin_8',
            subjectType: 'role',
            subjectValue: 'admin',
            actions: ['read', 'edit', 'comment', 'annotate', 'share', 'admin'],
            priority: 100,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_chapter_based',
        name: '章节分级',
        description: '第一章仅项目组A可见，第二章所有人可见但仅管理员可批注，第三章对特定域名开放',
        defaultRules: [
          {
            id: 'rule_builtin_cb1',
            subjectType: 'everyone',
            subjectValue: '*',
            actions: ['read'],
            priority: 0,
          },
        ],
        paragraphPermissionPatterns: [
          {
            pattern: 'heading-level',
            headingLevel: 1,
            rules: [
              { subjectType: 'group', subjectValue: 'project-a', actions: ['read'], priority: 10 },
              { subjectType: 'everyone', subjectValue: '*', actions: ['read'], deny: true, priority: 1 },
            ],
            cascadeToChildren: true,
          },
          {
            pattern: 'heading-level',
            headingLevel: 2,
            rules: [
              { subjectType: 'everyone', subjectValue: '*', actions: ['read'], priority: 0 },
              { subjectType: 'role', subjectValue: 'admin', actions: ['annotate', 'comment'], priority: 100 },
            ],
            cascadeToChildren: true,
          },
          {
            pattern: 'heading-level',
            headingLevel: 3,
            rules: [
              { subjectType: 'domain', subjectValue: '@partner.com', actions: ['read'], priority: 10 },
              { subjectType: 'role', subjectValue: 'admin', actions: ['read', 'edit', 'comment', 'annotate', 'share', 'admin'], priority: 100 },
            ],
            cascadeToChildren: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import type { Paragraph, ParsedDocument, FileType } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitMarkdownIntoParagraphs(markdown: string): Omit<Paragraph, 'id' | 'index'>[] {
  const lines = markdown.split(/\r?\n/);
  const result: Omit<Paragraph, 'id' | 'index'>[] = [];
  let buffer: string[] = [];
  let currentType: Paragraph['type'] = 'paragraph';
  let currentLevel: number | undefined;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join('\n').trim();
    if (!content) {
      buffer = [];
      return;
    }
    result.push({
      type: currentType,
      level: currentLevel,
      content,
    });
    buffer = [];
    currentType = 'paragraph';
    currentLevel = undefined;
  };

  let inCode = false;
  let inQuote = false;

  for (const raw of lines) {
    const line = raw;

    if (line.trim().startsWith('```')) {
      if (!inCode) {
        flush();
        inCode = true;
        currentType = 'code';
        buffer.push(line);
      } else {
        buffer.push(line);
        flush();
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      buffer.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      result.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (currentType !== 'list') {
        flush();
        currentType = 'list';
      }
      buffer.push(line);
      continue;
    }

    if (/^>\s?/.test(line)) {
      if (!inQuote) {
        flush();
        inQuote = true;
        currentType = 'quote';
      }
      buffer.push(line.replace(/^>\s?/, ''));
      continue;
    } else {
      if (inQuote) {
        flush();
        inQuote = false;
      }
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    if (currentType === 'paragraph' && buffer.length > 0) {
      buffer.push(line);
    } else {
      flush();
      currentType = 'paragraph';
      buffer.push(line);
    }
  }

  flush();
  return result;
}

async function htmlToMarkdownParagraphs(html: string): Promise<Omit<Paragraph, 'id' | 'index'>[]> {
  const { marked: md } = await import('marked');
  const tokens = md.lexer(html);
  const out: Omit<Paragraph, 'id' | 'index'>[] = [];
  const walker = (toks: any[]) => {
    for (const tok of toks) {
      if (tok.type === 'heading') {
        out.push({ type: 'heading', level: tok.depth, content: tok.text });
      } else if (tok.type === 'paragraph') {
        out.push({ type: 'paragraph', content: tok.text });
      } else if (tok.type === 'list') {
        const items = tok.items.map((it) => `* ${it.text}`).join('\n');
        if (items) out.push({ type: 'list', content: items });
      } else if (tok.type === 'code') {
        out.push({ type: 'code', content: `\`\`\`${tok.lang || ''}\n${tok.text}\n\`\`\`` });
      } else if (tok.type === 'blockquote') {
        out.push({ type: 'quote', content: tok.text });
      } else if (tok.type === 'table') {
        const header = tok.header.map((c) => c.text).join(' | ');
        const sep = tok.header.map(() => '---').join(' | ');
        const rows = tok.rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n');
        out.push({ type: 'table', content: `${header}\n${sep}\n${rows}` });
      }
    }
  };
  walker(tokens as unknown as any[]);
  if (out.length === 0) {
    out.push({ type: 'paragraph', content: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

export class DocumentParser {
  static async parseMarkdownFile(filePath: string, originalName: string): Promise<{ title: string; markdown: string }> {
    const raw = await fs.readFile(filePath, 'utf8');
    const firstHeading = raw.match(/^#\s+(.+)$/m)?.[1];
    const title = firstHeading || path.basename(originalName, path.extname(originalName));
    return { title, markdown: raw };
  }

  static async parseDocxFile(filePath: string, originalName: string): Promise<{ title: string; markdown: string }> {
    const buffer = await fs.readFile(filePath);
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const { tokens } = marked.lexer(html) as unknown as { tokens: any[] };
    let md = '';
    const walk = (toks: any[]) => {
      for (const tok of toks) {
        if (tok.type === 'heading') {
          md += `${'#'.repeat(tok.depth)} ${tok.text}\n\n`;
        } else if (tok.type === 'paragraph') {
          md += `${tok.text}\n\n`;
        } else if (tok.type === 'list') {
          for (const it of tok.items) md += `* ${it.text}\n`;
          md += '\n';
        } else if (tok.type === 'code') {
          md += `\`\`\`${tok.lang || ''}\n${tok.text}\n\`\`\`\n\n`;
        } else if (tok.type === 'blockquote') {
          md += `> ${tok.text.split('\n').join('\n> ')}\n\n`;
        }
      }
    };
    walk(tokens || []);
    if (!md.trim()) {
      md = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const firstHeading = md.match(/^#\s+(.+)$/m)?.[1];
    const title = firstHeading || path.basename(originalName, path.extname(originalName));
    return { title, markdown: md };
  }

  static async buildParsedDocument(docId: string, markdown: string, fileType: FileType): Promise<ParsedDocument> {
    const raw = fileType === 'markdown'
      ? splitMarkdownIntoParagraphs(markdown)
      : await htmlToMarkdownParagraphs(markdown);
    const paragraphs: Paragraph[] = raw.map((p, i) => ({
      id: genId('p'),
      index: i,
      type: p.type,
      level: p.level,
      content: p.content,
    }));
    return { docId, paragraphs };
  }

  static async saveParsed(parsed: ParsedDocument) {
    await FileStorageService.writeJson(FileStorageService.getParsedPath(parsed.docId), parsed);
  }

  static async getParsed(docId: string): Promise<ParsedDocument> {
    return FileStorageService.readJson<ParsedDocument>(FileStorageService.getParsedPath(docId), {
      docId,
      paragraphs: [],
    });
  }
}

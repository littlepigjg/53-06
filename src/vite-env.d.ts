/// <reference types="vite/client" />

declare module 'react-markdown' {
  import type { ComponentType, ReactNode } from 'react';
  interface ReactMarkdownProps {
    children?: string;
    remarkPlugins?: any[];
    rehypePlugins?: any[];
    components?: Record<string, any>;
    className?: string;
  }
  const ReactMarkdown: ComponentType<ReactMarkdownProps>;
  export default ReactMarkdown;
}

declare module 'remark-gfm' {
  const remarkGfm: any;
  export default remarkGfm;
}

declare module 'mammoth' {
  export function convertToHtml(opts: { buffer: Buffer }): Promise<{ value: string; messages: any[] }>;
  export function convertToMarkdown(opts: { buffer: Buffer }): Promise<{ value: string; messages: any[] }>;
}

declare module 'marked' {
  export const marked: {
    parse(src: string, opts?: any): string;
    lexer(src: string, opts?: any): any[];
    use(opts: any): any;
  };
  export default marked;
}

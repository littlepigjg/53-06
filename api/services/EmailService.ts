import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import 'dotenv/config';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
    from,
  };
}

let transporter: Transporter | null = null;
let lastConfigHash = '';

function getTransporter(): Transporter | null {
  const config = getEmailConfig();
  if (!config) return null;

  const configHash = JSON.stringify(config);
  if (!transporter || configHash !== lastConfigHash) {
    try {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });
      lastConfigHash = configHash;
    } catch (e) {
      console.error('[EMAIL] Failed to create transporter:', e);
      return null;
    }
  }

  return transporter;
}

export class EmailService {
  static isConfigured(): boolean {
    return getEmailConfig() !== null;
  }

  static async sendEmail(options: EmailOptions): Promise<boolean> {
    const config = getEmailConfig();
    if (!config) {
      console.warn('[EMAIL] SMTP not configured, email not sent:', options.subject);
      return false;
    }

    const transporter = getTransporter();
    if (!transporter) {
      console.error('[EMAIL] Failed to get transporter');
      return false;
    }

    try {
      await transporter.sendMail({
        from: config.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        cc: options.cc,
        bcc: options.bcc,
      });
      console.info('[EMAIL] Sent:', options.subject, 'to', options.to);
      return true;
    } catch (e) {
      console.error('[EMAIL] Failed to send:', e);
      return false;
    }
  }

  static async sendAlert(
    alertEmails: string[],
    alertData: {
      docId: string;
      docTitle?: string;
      severity: string;
      message: string;
      triggerCount: number;
      windowMinutes: number;
      affectedUsers: { userId?: string; email?: string; name?: string }[];
      alertId: string;
      createdAt: string;
    }
  ): Promise<boolean> {
    if (alertEmails.length === 0) return false;

    const severityColors: Record<string, string> = {
      low: '#3b82f6',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#991b1b',
    };
    const color = severityColors[alertData.severity] || '#f59e0b';

    const subject = `[${alertData.severity.toUpperCase()}] 文档安全告警 - ${alertData.docId}`;

    const affectedUsersList = alertData.affectedUsers
      .map((u) => `• ${u.name || '匿名'} (${u.email || u.userId || '未知'})`)
      .join('\n');

    const text = `
文档安全告警
============

严重程度: ${alertData.severity.toUpperCase()}
文档ID: ${alertData.docId}
${alertData.docTitle ? `文档标题: ${alertData.docTitle}` : ''}
告警ID: ${alertData.alertId}
触发时间: ${alertData.createdAt}

告警信息:
${alertData.message}

统计信息:
• 触发次数: ${alertData.triggerCount} 次
• 时间窗口: ${alertData.windowMinutes} 分钟
• 涉及用户数: ${alertData.affectedUsers.length} 个

涉及用户:
${affectedUsersList}

请立即登录系统查看详情并采取相应措施。
    `.trim();

    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: ${color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">🔒 文档安全告警</h2>
  </div>
  <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
    <table style="width: 100%; margin-bottom: 16px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; width: 100px;">严重程度:</td>
        <td style="padding: 8px 0;">
          <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            ${alertData.severity.toUpperCase()}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">文档ID:</td>
        <td style="padding: 8px 0; font-family: monospace;">${alertData.docId}</td>
      </tr>
      ${alertData.docTitle ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">文档标题:</td>
        <td style="padding: 8px 0;">${alertData.docTitle}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 8px 0; color: #64748b;">触发时间:</td>
        <td style="padding: 8px 0;">${alertData.createdAt}</td>
      </tr>
    </table>

    <div style="background: #fef3c7; border-left: 4px solid ${color}; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;">
      <p style="margin: 0; color: #92400e;">${alertData.message}</p>
    </div>

    <h3 style="color: #1e293b; margin: 16px 0 8px 0; font-size: 14px;">统计信息</h3>
    <ul style="color: #475569; margin: 0; padding-left: 20px;">
      <li>触发次数: <strong>${alertData.triggerCount}</strong> 次</li>
      <li>时间窗口: <strong>${alertData.windowMinutes}</strong> 分钟</li>
      <li>涉及用户数: <strong>${alertData.affectedUsers.length}</strong> 个</li>
    </ul>

    <h3 style="color: #1e293b; margin: 16px 0 8px 0; font-size: 14px;">涉及用户</h3>
    <ul style="color: #475569; margin: 0; padding-left: 20px;">
      ${alertData.affectedUsers.map((u) => `<li>${u.name || '匿名'} (${u.email || u.userId || '未知'})</li>`).join('')}
    </ul>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        请立即登录系统查看详情并采取相应措施。
      </p>
    </div>
  </div>
</div>
    `.trim();

    return this.sendEmail({
      to: alertEmails,
      subject,
      text,
      html,
    });
  }

  static async sendAccessDeniedAlert(
    alertEmails: string[],
    logData: {
      docId: string;
      docTitle?: string;
      paragraphId?: string;
      action: string;
      user: { userId?: string; email?: string; name?: string };
      ip?: string;
      timestamp: string;
    }
  ): Promise<boolean> {
    if (alertEmails.length === 0) return false;

    const subject = `[WARNING] 越权访问尝试 - ${logData.docId}`;

    const text = `
越权访问尝试告警
==============

文档ID: ${logData.docId}
${logData.docTitle ? `文档标题: ${logData.docTitle}` : ''}
${logData.paragraphId ? `段落ID: ${logData.paragraphId}` : ''}
尝试操作: ${logData.action}
时间: ${logData.timestamp}
${logData.ip ? `IP地址: ${logData.ip}` : ''}

用户信息:
• 姓名: ${logData.user.name || '匿名'}
• 邮箱: ${logData.user.email || '未提供'}
• 用户ID: ${logData.user.userId || '未提供'}

这是单次越权访问尝试通知。如果短时间内多次出现，系统将自动升级告警级别。
    `.trim();

    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f59e0b; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">⚠️ 越权访问尝试</h2>
  </div>
  <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
    <table style="width: 100%; margin-bottom: 16px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; width: 100px;">文档ID:</td>
        <td style="padding: 8px 0; font-family: monospace;">${logData.docId}</td>
      </tr>
      ${logData.docTitle ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">文档标题:</td>
        <td style="padding: 8px 0;">${logData.docTitle}</td>
      </tr>
      ` : ''}
      ${logData.paragraphId ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">段落ID:</td>
        <td style="padding: 8px 0; font-family: monospace;">${logData.paragraphId}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 8px 0; color: #64748b;">尝试操作:</td>
        <td style="padding: 8px 0;">
          <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${logData.action}</code>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">时间:</td>
        <td style="padding: 8px 0;">${logData.timestamp}</td>
      </tr>
      ${logData.ip ? `
      <tr>
        <td style="padding: 8px 0; color: #64748b;">IP地址:</td>
        <td style="padding: 8px 0; font-family: monospace;">${logData.ip}</td>
      </tr>
      ` : ''}
    </table>

    <h3 style="color: #1e293b; margin: 16px 0 8px 0; font-size: 14px;">用户信息</h3>
    <ul style="color: #475569; margin: 0; padding-left: 20px;">
      <li>姓名: <strong>${logData.user.name || '匿名'}</strong></li>
      <li>邮箱: <strong>${logData.user.email || '未提供'}</strong></li>
      <li>用户ID: <strong>${logData.user.userId || '未提供'}</strong></li>
    </ul>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
        这是单次越权访问尝试通知。如果短时间内多次出现，系统将自动升级告警级别。
      </p>
    </div>
  </div>
</div>
    `.trim();

    return this.sendEmail({
      to: alertEmails,
      subject,
      text,
      html,
    });
  }
}

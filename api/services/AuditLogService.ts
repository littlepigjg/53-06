import type { AuditLogEntry, AuditLogType, PermissionAction, UserContext, AlertNotification, PermissionAlertConfig } from '../../shared/types.js';
import { FileStorageService } from './FileStorageService.js';
import { PermissionService } from './PermissionService.js';
import { EmailService } from './EmailService.js';
import { DocumentService } from './DocumentService.js';

function genLogId() {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genAlertId() {
  return `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_ALERT_CONFIG: PermissionAlertConfig = {
  enabled: true,
  accessDeniedThreshold: 5,
  accessDeniedWindowMinutes: 10,
  severity: 'medium',
  escalationEnabled: true,
  escalationThreshold: 20,
  escalationSeverity: 'critical',
};

export class AuditLogService {
  static async getLogs(docId: string): Promise<AuditLogEntry[]> {
    const logs = await FileStorageService.readJson<AuditLogEntry[]>(
      FileStorageService.getAuditLogsPath(docId),
      []
    );
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  static async addLog(
    type: AuditLogType,
    docId: string,
    userContext: UserContext,
    options: {
      paragraphId?: string;
      action?: PermissionAction;
      ip?: string;
      userAgent?: string;
      details?: Record<string, unknown>;
    } = {}
  ): Promise<AuditLogEntry> {
    const log: AuditLogEntry = {
      id: genLogId(),
      type,
      docId,
      paragraphId: options.paragraphId,
      action: options.action,
      userContext: {
        userId: userContext.userId,
        email: userContext.email,
        name: userContext.name,
      },
      timestamp: new Date().toISOString(),
      ip: options.ip,
      userAgent: options.userAgent,
      details: options.details,
    };

    const logs = await FileStorageService.readJson<AuditLogEntry[]>(
      FileStorageService.getAuditLogsPath(docId),
      []
    );
    logs.push(log);
    await FileStorageService.writeJson(FileStorageService.getAuditLogsPath(docId), logs);

    if (type === 'access_denied') {
      this.notifyAdmin(log);
      this.checkAlertThreshold(docId);
    }

    return log;
  }

  private static async notifyAdmin(log: AuditLogEntry): Promise<void> {
    const alertConfig = await PermissionService.getAlertConfig(log.docId);
    const config = alertConfig || DEFAULT_ALERT_CONFIG;

    const alert = {
      level: 'WARNING',
      message: `Unauthorized access attempt detected`,
      timestamp: log.timestamp,
      docId: log.docId,
      paragraphId: log.paragraphId,
      action: log.action,
      user: log.userContext,
      ip: log.ip,
    };
    console.warn('[SECURITY ALERT]', JSON.stringify(alert, null, 2));

    if (config.notifyEmails && config.notifyEmails.length > 0 && EmailService.isConfigured()) {
      try {
        const doc = await DocumentService.get(log.docId);
        await EmailService.sendAccessDeniedAlert(config.notifyEmails, {
          docId: log.docId,
          docTitle: doc?.title,
          paragraphId: log.paragraphId,
          action: log.action || 'unknown',
          user: log.userContext,
          ip: log.ip,
          timestamp: log.timestamp,
        });
      } catch (e) {
        console.error('[ALERT EMAIL ERROR]', e);
      }
    }
  }

  private static async checkAlertThreshold(docId: string): Promise<void> {
    try {
      const alertConfig = await PermissionService.getAlertConfig(docId);
      const config = alertConfig || DEFAULT_ALERT_CONFIG;

      if (!config.enabled) return;

      const windowMs = config.accessDeniedWindowMinutes * 60 * 1000;
      const windowStart = new Date(Date.now() - windowMs).toISOString();

      const recentDeniedLogs = await this.queryLogs(docId, {
        type: 'access_denied',
        startDate: windowStart,
      });

      if (recentDeniedLogs.length < config.accessDeniedThreshold) return;

      const activeAlerts = await this.getActiveAlerts(docId);
      const recentAlert = activeAlerts.find(
        (a) => Date.now() - new Date(a.createdAt).getTime() < windowMs
      );
      if (recentAlert) return;

      const affectedUsers = Array.from(
        new Map(
          recentDeniedLogs.map((l) => [
            l.userContext.userId || l.userContext.email || 'anonymous',
            { userId: l.userContext.userId, email: l.userContext.email, name: l.userContext.name },
          ])
        ).values()
      );

      const notification: AlertNotification = {
        id: genAlertId(),
        docId,
        severity: config.severity,
        status: 'active',
        triggerCount: recentDeniedLogs.length,
        windowStart,
        windowEnd: new Date().toISOString(),
        message: `在 ${config.accessDeniedWindowMinutes} 分钟内检测到 ${recentDeniedLogs.length} 次未授权访问尝试`,
        affectedUsers,
        createdAt: new Date().toISOString(),
      };

      await this.saveAlert(docId, notification);
      await this.addLog('alert_triggered', docId, { name: 'system' }, {
        details: {
          alertId: notification.id,
          severity: notification.severity,
          triggerCount: notification.triggerCount,
          message: notification.message,
        },
      });

      if (config.notifyEmails && config.notifyEmails.length > 0 && EmailService.isConfigured()) {
        try {
          const doc = await DocumentService.get(docId);
          await EmailService.sendAlert(config.notifyEmails, {
            docId,
            docTitle: doc?.title,
            severity: notification.severity,
            message: notification.message,
            triggerCount: notification.triggerCount,
            windowMinutes: config.accessDeniedWindowMinutes,
            affectedUsers: notification.affectedUsers,
            alertId: notification.id,
            createdAt: notification.createdAt,
          });
        } catch (e) {
          console.error('[ALERT EMAIL ERROR]', e);
        }
      }

      if (config.escalationEnabled && recentDeniedLogs.length >= config.escalationThreshold) {
        const escalation: AlertNotification = {
          ...notification,
          id: genAlertId(),
          severity: config.escalationSeverity,
          message: `[升级] 在 ${config.accessDeniedWindowMinutes} 分钟内检测到 ${recentDeniedLogs.length} 次未授权访问尝试，已超过升级阈值 ${config.escalationThreshold}`,
          createdAt: new Date().toISOString(),
        };
        await this.saveAlert(docId, escalation);

        await this.escalationNotify(escalation, config);
      }
    } catch (e) {
      console.error('[ALERT CHECK ERROR]', e);
    }
  }

  private static async escalationNotify(alert: AlertNotification, config: PermissionAlertConfig): Promise<void> {
    const escalationData = {
      level: 'CRITICAL',
      message: alert.message,
      severity: alert.severity,
      docId: alert.docId,
      triggerCount: alert.triggerCount,
      threshold: config.escalationThreshold,
      notifyEmails: config.notifyEmails,
      timestamp: alert.createdAt,
    };
    console.error('[SECURITY ESCALATION]', JSON.stringify(escalationData, null, 2));

    if (config.notifyEmails && config.notifyEmails.length > 0 && EmailService.isConfigured()) {
      try {
        const doc = await DocumentService.get(alert.docId);
        await EmailService.sendAlert(config.notifyEmails, {
          docId: alert.docId,
          docTitle: doc?.title,
          severity: alert.severity,
          message: alert.message,
          triggerCount: alert.triggerCount,
          windowMinutes: config.accessDeniedWindowMinutes,
          affectedUsers: alert.affectedUsers,
          alertId: alert.id,
          createdAt: alert.createdAt,
        });
      } catch (e) {
        console.error('[ESCALATION EMAIL ERROR]', e);
      }
    }
  }

  static async getAlertsPath(docId: string): Promise<string> {
    return FileStorageService.getAlertsPath(docId);
  }

  static async getAlerts(docId: string): Promise<AlertNotification[]> {
    const alertsPath = FileStorageService.getAlertsPath(docId);
    const alerts = await FileStorageService.readJson<AlertNotification[]>(alertsPath, []);
    return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static async getActiveAlerts(docId: string): Promise<AlertNotification[]> {
    const alerts = await this.getAlerts(docId);
    return alerts.filter((a) => a.status === 'active');
  }

  static async saveAlert(docId: string, alert: AlertNotification): Promise<void> {
    const alertsPath = FileStorageService.getAlertsPath(docId);
    const alerts = await FileStorageService.readJson<AlertNotification[]>(alertsPath, []);
    alerts.push(alert);
    await FileStorageService.writeJson(alertsPath, alerts);
  }

  static async acknowledgeAlert(docId: string, alertId: string, acknowledgedBy: string): Promise<AlertNotification | null> {
    const alertsPath = FileStorageService.getAlertsPath(docId);
    const alerts = await FileStorageService.readJson<AlertNotification[]>(alertsPath, []);
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    await FileStorageService.writeJson(alertsPath, alerts);
    return alert;
  }

  static async resolveAlert(docId: string, alertId: string, resolvedBy: string): Promise<AlertNotification | null> {
    const alertsPath = FileStorageService.getAlertsPath(docId);
    const alerts = await FileStorageService.readJson<AlertNotification[]>(alertsPath, []);
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();

    await FileStorageService.writeJson(alertsPath, alerts);
    return alert;
  }

  static async logAccessGranted(
    docId: string,
    paragraphId: string | undefined,
    action: PermissionAction,
    userContext: UserContext,
    ip?: string,
    userAgent?: string
  ): Promise<AuditLogEntry> {
    return this.addLog('access_granted', docId, userContext, {
      paragraphId,
      action,
      ip,
      userAgent,
    });
  }

  static async logAccessDenied(
    docId: string,
    paragraphId: string | undefined,
    action: PermissionAction,
    userContext: UserContext,
    ip?: string,
    userAgent?: string,
    details?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.addLog('access_denied', docId, userContext, {
      paragraphId,
      action,
      ip,
      userAgent,
      details,
    });
  }

  static async logPermissionChanged(
    docId: string,
    userContext: UserContext,
    details: Record<string, unknown>,
    ip?: string
  ): Promise<AuditLogEntry> {
    return this.addLog('permission_changed', docId, userContext, {
      ip,
      details,
    });
  }

  static async logShareCreated(
    docId: string,
    userContext: UserContext,
    details: Record<string, unknown>,
    ip?: string
  ): Promise<AuditLogEntry> {
    return this.addLog('share_created', docId, userContext, {
      ip,
      details,
    });
  }

  static async logShareAccessed(
    docId: string,
    userContext: UserContext,
    details: Record<string, unknown>,
    ip?: string,
    userAgent?: string
  ): Promise<AuditLogEntry> {
    return this.addLog('share_accessed', docId, userContext, {
      ip,
      userAgent,
      details,
    });
  }

  static async queryLogs(
    docId: string,
    filters: {
      type?: AuditLogType;
      action?: PermissionAction;
      userId?: string;
      email?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    } = {}
  ): Promise<AuditLogEntry[]> {
    let logs = await this.getLogs(docId);

    if (filters.type) {
      logs = logs.filter((l) => l.type === filters.type);
    }
    if (filters.action) {
      logs = logs.filter((l) => l.action === filters.action);
    }
    if (filters.userId) {
      logs = logs.filter((l) => l.userContext.userId === filters.userId);
    }
    if (filters.email) {
      logs = logs.filter((l) => l.userContext.email?.toLowerCase() === filters.email.toLowerCase());
    }
    if (filters.startDate) {
      logs = logs.filter((l) => l.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      logs = logs.filter((l) => l.timestamp <= filters.endDate!);
    }
    if (filters.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  }

  static async getAccessDeniedLogs(docId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.queryLogs(docId, { type: 'access_denied', limit });
  }

  static async getStatistics(docId: string): Promise<{
    total: number;
    accessGranted: number;
    accessDenied: number;
    permissionChanged: number;
    shareCreated: number;
    shareAccessed: number;
    alertTriggered: number;
    byDate: { date: string; count: number }[];
  }> {
    const logs = await this.getLogs(docId);
    const byDate = new Map<string, number>();

    let accessGranted = 0;
    let accessDenied = 0;
    let permissionChanged = 0;
    let shareCreated = 0;
    let shareAccessed = 0;
    let alertTriggered = 0;

    for (const log of logs) {
      const date = log.timestamp.split('T')[0];
      byDate.set(date, (byDate.get(date) || 0) + 1);

      switch (log.type) {
        case 'access_granted':
          accessGranted++;
          break;
        case 'access_denied':
          accessDenied++;
          break;
        case 'permission_changed':
          permissionChanged++;
          break;
        case 'share_created':
          shareCreated++;
          break;
        case 'share_accessed':
          shareAccessed++;
          break;
        case 'alert_triggered':
          alertTriggered++;
          break;
      }
    }

    return {
      total: logs.length,
      accessGranted,
      accessDenied,
      permissionChanged,
      shareCreated,
      shareAccessed,
      alertTriggered,
      byDate: Array.from(byDate.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  static async deleteLogs(docId: string): Promise<void> {
    await FileStorageService.deleteFile(FileStorageService.getAuditLogsPath(docId));
  }

  static getDefaultAlertConfig(): PermissionAlertConfig {
    return { ...DEFAULT_ALERT_CONFIG };
  }
}

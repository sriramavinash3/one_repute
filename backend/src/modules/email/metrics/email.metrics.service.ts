/**
 * src/modules/email/metrics/email.metrics.service.ts
 * 
 * Production email event logging and performance monitoring service.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface EmailLogEvent {
  userId?: string;
  email: string;
  template: string;
  provider: string;
  status: 'QUEUED' | 'SENDING' | 'DELIVERED' | 'FAILED' | 'BOUNCED';
  queueId?: string;
  latencyMs?: number;
  failureReason?: string;
  retries?: number;
  metadata?: Record<string, any>;
}

export interface EmailMetricsSummary {
  totalSent: number;
  totalDelivered: number;
  totalFailures: number;
  retryCount: number;
  averageDeliveryLatencyMs: number;
  bounceRatePlaceholder: string;
  recentLogs: Array<EmailLogEvent & { timestamp: string }>;
}

@Injectable()
export class EmailMetricsService {
  private readonly logger = new Logger(EmailMetricsService.name);
  private readonly logs: Array<EmailLogEvent & { timestamp: string }> = [];

  private totalSent = 0;
  private totalDelivered = 0;
  private totalFailures = 0;
  private totalRetries = 0;
  private totalLatencyMs = 0;

  /**
   * Log email event to in-memory store & structured logger
   */
  async recordEmailEvent(event: EmailLogEvent): Promise<void> {
    const entry = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(entry);
    if (this.logs.length > 500) {
      this.logs.pop(); // Cap history to 500 items
    }

    this.totalSent++;
    if (event.status === 'DELIVERED') {
      this.totalDelivered++;
    } else if (event.status === 'FAILED') {
      this.totalFailures++;
    }

    if (event.retries) {
      this.totalRetries += event.retries;
    }

    if (event.latencyMs) {
      this.totalLatencyMs += event.latencyMs;
    }

    this.logger.log(`[EMAIL EVENT LOGGED] ${event.template} -> ${event.email} | Status: ${event.status} | Latency: ${event.latencyMs || 0}ms`);
  }

  /**
   * Return aggregated email performance metrics
   */
  getMetrics(): EmailMetricsSummary {
    const avgLatency = this.totalDelivered > 0 ? Math.round(this.totalLatencyMs / this.totalDelivered) : 0;
    const bounceRate = this.totalSent > 0 ? `${((this.totalFailures / this.totalSent) * 100).toFixed(1)}%` : '0.0%';

    return {
      totalSent: this.totalSent,
      totalDelivered: this.totalDelivered,
      totalFailures: this.totalFailures,
      retryCount: this.totalRetries,
      averageDeliveryLatencyMs: avgLatency,
      bounceRatePlaceholder: bounceRate,
      recentLogs: this.logs.slice(0, 50),
    };
  }
}

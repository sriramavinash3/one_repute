import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PlanEligibilityType = 'all' | 'trial_only' | 'expired_trial' | 'paid_only' | 'growth_or_higher' | 'premium_only';

export interface WhatsAppTemplateDefinition {
  templateKey: string;
  event: string;
  channel: 'whatsapp';
  body: string;
  requiredVariables: string[];
  planEligibility: PlanEligibilityType;
  isActive: boolean;
  envContentSidKey?: string;
}

export interface RenderedTemplateResult {
  templateKey: string;
  body: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);
  private readonly templates: Map<string, WhatsAppTemplateDefinition> = new Map();

  constructor(private readonly config: ConfigService) {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates() {
    const definitions: WhatsAppTemplateDefinition[] = [
      {
        templateKey: 'TRIAL_STARTED',
        event: 'trial_started',
        channel: 'whatsapp',
        body: `Hi {{Name}}, welcome to One Repute 👋\n\nYour {{Outlet Name}} trial is now active.\n\nBefore we get things running smoothly, we just need a few quick preferences from you:\n• Escalation contact\n• Customer name suffix\n• Message shown for negative feedback\n\nIt’ll only take a couple of minutes.\n\nComplete setup here: {{Link}}\n\nNeed help? Just reply here.`,
        requiredVariables: ['Name', 'Outlet Name', 'Link'],
        planEligibility: 'trial_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_TRIAL_STARTED',
      },
      {
        templateKey: 'TRIAL_DAY_12_PERFORMANCE',
        event: 'trial_day_12_performance',
        channel: 'whatsapp',
        body: `Hi {{Name}}, your One Repute trial has been running for almost two weeks now.\n\nWe’ve put together a quick review of how {{Outlet Name}} is performing on Google - including reviews, responses, negative feedback and areas that could improve your profile.\n\nYou can check the full feedback here:\n{{Link}}\n\nIf there’s anything you’d like us to explain, just reply to this message.`,
        requiredVariables: ['Name', 'Outlet Name', 'Link'],
        planEligibility: 'trial_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_TRIAL_DAY_12',
      },
      {
        templateKey: 'TRIAL_DAY_14_RENEWAL',
        event: 'trial_day_14_renewal',
        channel: 'whatsapp',
        body: `Hi {{Name}}, your One Repute trial for {{Outlet Name}} completes tomorrow.\n\nIf auto-renewal is enabled, your selected {{Plan Name}} plan will continue from {{Renewal Date}} at ₹{{Amount}}.\n\nYou can review your plan or billing details here:\n{{Link}}\n\nNeed any clarification before renewal? Reply here and we’ll help.`,
        requiredVariables: ['Name', 'Outlet Name', 'Plan Name', 'Renewal Date', 'Amount', 'Link'],
        planEligibility: 'trial_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_TRIAL_DAY_14',
      },
      {
        templateKey: 'PLAN_ACTIVATED',
        event: 'plan_activated',
        channel: 'whatsapp',
        body: `Hi {{Name}}, you’re officially continuing with One Repute 🎉\n\nYour {{Plan Name}} plan for {{Outlet Name}} is now active.\n\nWe’ll continue monitoring your Google reviews, helping you stay on top of negative feedback, responses and your overall reputation performance.\n\nYou can access your account here:\n{{Link}}\n\nGlad to have {{Outlet Name}} with One Repute.`,
        requiredVariables: ['Name', 'Plan Name', 'Outlet Name', 'Link'],
        planEligibility: 'paid_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_PLAN_ACTIVATED',
      },
      {
        templateKey: 'TRIAL_EXPIRED_FEEDBACK',
        event: 'trial_expired_feedback',
        channel: 'whatsapp',
        body: `Hi {{Name}}, your One Repute trial for {{Outlet Name}} has come to an end.\n\nWe noticed you’ve decided not to continue with a plan for now.\n\nWould you mind telling us what influenced your decision? Just choose the option that fits best:\n\n[ Pricing ]\n\n[ Need more time ]\n\n[ Missing a feature ]\n\n[ Need internal approval ]\n\n[ Not a priority now ]\n\nYour feedback genuinely helps us make One Repute better.\n\nIf you'd like to share anything more, simply reply to this message.`,
        requiredVariables: ['Name', 'Outlet Name'],
        planEligibility: 'expired_trial',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_TRIAL_EXPIRED',
      },
      {
        templateKey: 'POST_TRIAL_NEGATIVE_REVIEW_REENGAGEMENT',
        event: 'post_trial_negative_review_reengagement',
        channel: 'whatsapp',
        body: `Hi {{Name}}, just a quick heads-up from One Repute.\n\nA new {{Rating}}-star review has appeared for {{Outlet Name}}.\n\nSince you had connected your Google Business Profile during the trial, we thought this was worth bringing to your attention.\n\nWith One Repute active, you can also:\n• Get timely alerts for negative reviews\n• Respond to reviews with AI-assisted replies\n• Escalate critical feedback to the right person\n• Track review and response performance\n• Understand customer sentiment and recurring concerns\n• Get performance & intelligence reports for your outlet\n\nIf you'd like One Repute to start helping you with these again, you can log back in anytime.\n\n{{Login Link}}`,
        requiredVariables: ['Name', 'Rating', 'Outlet Name', 'Login Link'],
        planEligibility: 'all',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_POST_TRIAL_REENGAGEMENT',
      },
      {
        templateKey: 'PAID_15_DAY_REPORT',
        event: 'paid_15_day_report',
        channel: 'whatsapp',
        body: `Hi {{Name}}, here’s your latest One Repute performance update for {{Outlet Name}}.\n\nOver the last 15 days, we’ve tracked how your Google reviews and customer responses are performing.\n\nYour report includes:\n• New reviews received\n• Reviews responded to\n• Negative feedback\n• Response performance\n• Reputation trends\n\nView your 15-day report:\n{{Report Link}}`,
        requiredVariables: ['Name', 'Outlet Name', 'Report Link'],
        planEligibility: 'paid_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_PAID_15D_REPORT',
      },
      {
        templateKey: 'PAID_30_DAY_INTELLIGENCE_REPORT',
        event: 'paid_30_day_intelligence_report',
        channel: 'whatsapp',
        body: `Hi {{Name}}, your monthly One Repute Intelligence Report is ready for {{Outlet Name}}.\n\nThis goes beyond review numbers.\n\nYou’ll be able to see what customers are appreciating, recurring concerns, negative review patterns, response performance and areas your outlet can improve.\n\nView your 30-day report:\n{{Report Link}}\n\nThink of this as your monthly customer reputation health check.`,
        requiredVariables: ['Name', 'Outlet Name', 'Report Link'],
        planEligibility: 'paid_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_PAID_30D_REPORT',
      },
      {
        templateKey: 'ESCALATION_LEVEL_1',
        event: 'escalation_level_1',
        channel: 'whatsapp',
        body: `Hi {{Name}}, a negative Google review has come in for {{Outlet Name}}.\n\n⭐ {{Rating}} Star\nCustomer: {{Customer Name}}\nReview: “{{Review Snip}}”\n\nThis may need your team’s attention before responding.\n\nReply to the review here:\n{{Link}}`,
        requiredVariables: ['Name', 'Outlet Name', 'Rating', 'Customer Name', 'Review Snip', 'Link'],
        planEligibility: 'all',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_ESC_L1',
      },
      {
        templateKey: 'ESCALATION_LEVEL_2',
        event: 'escalation_level_2',
        channel: 'whatsapp',
        body: `Hi {{Name}}, just following up on the negative review received for {{Outlet Name}}.\n\n⭐ {{Rating}} Star\nCustomer: {{Customer Name}}\n\nThe review is still awaiting attention. A timely response can help show the customer that their concern is being taken seriously.\n\nReview and respond here:\n{{Link}}`,
        requiredVariables: ['Name', 'Outlet Name', 'Rating', 'Customer Name', 'Link'],
        planEligibility: 'growth_or_higher',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_ESC_L2',
      },
      {
        templateKey: 'ESCALATION_LEVEL_3',
        event: 'escalation_level_3',
        channel: 'whatsapp',
        body: `Hi {{Name}}, this is a final follow-up on the negative review for {{Outlet Name}}.\n\nThe review is still pending a response, and we recommend addressing it at the earliest to avoid leaving the customer concern unattended.\n\nReview and respond here:\n{{Link}}`,
        requiredVariables: ['Name', 'Outlet Name', 'Rating', 'Customer Name', 'Link'],
        planEligibility: 'premium_only',
        isActive: true,
        envContentSidKey: 'TWILIO_CONTENT_SID_ESC_L3',
      },
    ];

    for (const def of definitions) {
      this.templates.set(def.templateKey, def);
    }
  }

  getTemplate(templateKey: string): WhatsAppTemplateDefinition | undefined {
    return this.templates.get(templateKey);
  }

  getAllTemplates(): WhatsAppTemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  /**
   * Render template body with variable validation.
   * Throws an error if required variables are missing.
   */
  renderTemplate(templateKey: string, variables: Record<string, any> = {}): RenderedTemplateResult {
    const template = this.getTemplate(templateKey);
    if (!template) {
      throw new Error(`WhatsApp template '${templateKey}' not found in registry.`);
    }

    if (!template.isActive) {
      throw new Error(`WhatsApp template '${templateKey}' is currently inactive.`);
    }

    // Validate required variables
    const missing: string[] = [];
    for (const reqVar of template.requiredVariables) {
      const val = variables[reqVar];
      if (val === undefined || val === null || String(val).trim() === '') {
        missing.push(reqVar);
      }
    }

    if (missing.length > 0) {
      const msg = `Cannot send template '${templateKey}': Missing required variable(s): ${missing.join(', ')}`;
      this.logger.warn(`[WhatsAppTemplate] ${msg}`);
      throw new Error(msg);
    }

    // Replace {{VarName}} placeholders
    let renderedBody = template.body;
    const contentVariables: Record<string, string> = {};

    Object.keys(variables).forEach((key, index) => {
      const val = String(variables[key] ?? '');
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      renderedBody = renderedBody.replace(placeholder, val);
      contentVariables[String(index + 1)] = val;
    });

    const contentSid = template.envContentSidKey ? this.config.get<string>(template.envContentSidKey) : undefined;

    return {
      templateKey,
      body: renderedBody,
      contentSid: contentSid || undefined,
      contentVariables,
    };
  }

  /**
   * Validate plan eligibility against template definition
   */
  isEligibleForPlan(templateKey: string, planName = '', isPaid = false, isTrial = false): boolean {
    const template = this.getTemplate(templateKey);
    if (!template) return false;

    const plan = (planName || '').toLowerCase();

    switch (template.planEligibility) {
      case 'all':
        return true;
      case 'trial_only':
        return isTrial || plan.includes('trial');
      case 'expired_trial':
        return !isPaid;
      case 'paid_only':
        return isPaid && (plan.includes('starter') || plan.includes('growth') || plan.includes('premium') || plan.includes('enterprise'));
      case 'growth_or_higher':
        return isPaid && (plan.includes('growth') || plan.includes('premium') || plan.includes('enterprise'));
      case 'premium_only':
        return isPaid && (plan.includes('premium') || plan.includes('enterprise'));
      default:
        return true;
    }
  }
}

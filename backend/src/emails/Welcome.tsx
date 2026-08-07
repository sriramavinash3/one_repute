import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface WelcomeEmailProps {
  userName: string;
  dashboardUrl?: string;
  supportEmail?: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  userName = 'Valued Partner',
  dashboardUrl = 'https://onerepute.com/dashboard',
  supportEmail = 'support@onerepute.com',
}) => {
  return (
    <BaseLayout previewText="Welcome to OneRepute — Automate your brand reputation in real-time.">
      <Heading style={headingStyle}>Welcome to OneRepute 🚀</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        We are thrilled to welcome you to <strong>OneRepute</strong> — your all-in-one AI reputation management platform. You are now equipped to manage reviews, automate customer responses, analyze feedback trends, and elevate your customer experience automatically.
      </Text>

      <Section style={featureGridStyle}>
        <div style={featureItemStyle}>
          <Text style={featureTitleStyle}>⚡ Real-Time Review Sync</Text>
          <Text style={featureDescStyle}>Connect Google Business Profile & platforms to aggregate reviews instantly.</Text>
        </div>
        <div style={featureItemStyle}>
          <Text style={featureTitleStyle}>🤖 AI Auto-Reply & Escalation</Text>
          <Text style={featureDescStyle}>Respond to positive reviews instantly and route negative reviews directly to your WhatsApp.</Text>
        </div>
        <div style={featureItemStyle}>
          <Text style={featureTitleStyle}>📊 Weekly Reputation Analytics</Text>
          <Text style={featureDescStyle}>Get actionable reports delivered directly to your inbox every week.</Text>
        </div>
      </Section>

      <Section style={ctaContainerStyle}>
        <Button href={dashboardUrl} style={primaryButtonStyle}>
          Go to your Dashboard →
        </Button>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        If you have any questions or need help setting up your integrations, our support team is available 24/7 at{' '}
        <a href={`mailto:${supportEmail}`} style={{ color: '#2563EB', textDecoration: 'none' }}>
          {supportEmail}
        </a>.
      </Text>
    </BaseLayout>
  );
};

export default WelcomeEmail;

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#0F172A',
  margin: '0 0 20px 0',
  letterSpacing: '-0.5px',
};

const paragraphStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#334155',
  margin: '0 0 16px 0',
};

const paragraphSubStyle: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#64748B',
  margin: '16px 0 0 0',
};

const featureGridStyle: React.CSSProperties = {
  margin: '24px 0',
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '20px',
  border: '1px solid #F1F5F9',
};

const featureItemStyle: React.CSSProperties = {
  marginBottom: '16px',
};

const featureTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 4px 0',
};

const featureDescStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#64748B',
  margin: 0,
  lineHeight: '18px',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '32px 0 24px 0',
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#2563EB',
  color: '#FFFFFF',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '14px 28px',
  display: 'inline-block',
  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

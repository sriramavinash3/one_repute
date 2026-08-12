import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface OnboardingConfirmedProps {
  userName: string;
  businessName: string;
  planName: string;
  isTrial?: boolean;
  dashboardUrl?: string;
}

export const OnboardingConfirmed: React.FC<OnboardingConfirmedProps> = ({
  userName = 'Partner',
  businessName = 'Your Business',
  planName = 'Starter',
  isTrial = true,
  dashboardUrl = 'https://onerepute.com/outlet/dashboard',
}) => {
  return (
    <BaseLayout previewText={`Setup Complete for ${businessName}! ${isTrial ? '14-Day Free Trial Activated' : 'Subscription Active'}.`}>
      <Heading style={headingStyle}>Business Onboarding Complete 🎉</Heading>

      <Text style={paragraphStyle}>Hi {userName},</Text>

      <Text style={paragraphStyle}>
        Congratulations! Onboarding and setup for <strong>{businessName}</strong> has been completed successfully.
      </Text>

      <Section style={cardSectionStyle}>
        <Text style={cardTitleStyle}>📋 Setup Details</Text>
        <Text style={cardDetailStyle}>
          • <strong>Business:</strong> {businessName}
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>Status:</strong> {isTrial ? '14-Day Free Trial Activated' : 'Active Plan'} ({planName})
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>Google My Business:</strong> Connected & Syncing Reviews
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>WhatsApp Escalation:</strong> Configured
        </Text>
      </Section>

      <Section style={ctaContainerStyle}>
        <Button href={dashboardUrl} style={primaryButtonStyle}>
          Access Outlet Dashboard →
        </Button>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        Need help adding additional team members or setting up automated QR codes? Visit your dashboard settings or reply directly to this email.
      </Text>
    </BaseLayout>
  );
};

export default OnboardingConfirmed;

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

const cardSectionStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '20px',
  border: '1px solid #E2E8F0',
  margin: '24px 0',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#0F172A',
  margin: '0 0 12px 0',
};

const cardDetailStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#334155',
  margin: '0 0 8px 0',
  lineHeight: '20px',
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

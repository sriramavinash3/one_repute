import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface OutletGreetingProps {
  userName: string;
  businessName: string;
  planName?: string;
  isTrial?: boolean;
  dashboardUrl?: string;
}

export const OutletGreeting: React.FC<OutletGreetingProps> = ({
  userName = 'Valued Partner',
  businessName = 'Your Business',
  planName = 'Starter',
  isTrial = true,
  dashboardUrl = 'https://onerepute.com/outlet/dashboard',
}) => {
  const planLabel = isTrial ? '15-Day Free Trial' : (planName || 'Registered Plan');

  return (
    <BaseLayout previewText={`Welcome to OneRepute — ${businessName} has been successfully registered!`}>
      <Heading style={headingStyle}>Outlet Successfully Registered! 🎉</Heading>

      <Text style={paragraphStyle}>Hi {userName},</Text>

      <Text style={paragraphStyle}>
        Welcome to OneRepute! We are excited to inform you that your outlet <strong>{businessName}</strong> has been successfully added to your account and is now ready for real-time reputation management.
      </Text>

      <Section style={cardSectionStyle}>
        <Text style={cardTitleStyle}>📍 Outlet Summary</Text>
        <Text style={cardDetailStyle}>
          • <strong>Outlet Name:</strong> {businessName}
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>Plan Status:</strong> {planLabel}
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>Review Sync:</strong> Active & Connected
        </Text>
        <Text style={cardDetailStyle}>
          • <strong>Automated AI Replies & WhatsApp Escalations:</strong> Ready
        </Text>
      </Section>

      <Text style={paragraphStyle}>
        You can monitor customer reviews, customize auto-reply settings, and view reputation analytics directly from your outlet dashboard.
      </Text>

      <Section style={ctaContainerStyle}>
        <Button href={dashboardUrl} style={primaryButtonStyle}>
          Open Outlet Dashboard →
        </Button>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        If you have any questions or need assistance configuring notifications for {businessName}, our support team is available 24/7. Simply reply directly to this email.
      </Text>
    </BaseLayout>
  );
};

export default OutletGreeting;

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

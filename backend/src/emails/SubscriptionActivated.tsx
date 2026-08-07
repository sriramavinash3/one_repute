import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface SubscriptionActivatedProps {
  userName: string;
  planName: string;
  amountPaid: string;
  renewalDate: string;
  receiptUrl?: string;
  dashboardUrl?: string;
}

export const SubscriptionActivated: React.FC<SubscriptionActivatedProps> = ({
  userName = 'Customer',
  planName = 'Pro Plan',
  amountPaid = '$49.00 / month',
  renewalDate = 'September 4, 2026',
  receiptUrl = 'https://onerepute.com/billing/receipts/inv_123',
  dashboardUrl = 'https://onerepute.com/dashboard',
}) => {
  return (
    <BaseLayout previewText={`Subscription Confirmed: Your OneRepute ${planName} is now active!`}>
      <Heading style={headingStyle}>Subscription Confirmed! 💳</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        Thank you for subscribing to OneRepute. Your <strong>{planName}</strong> subscription has been successfully activated. You now have full access to premium reputation automation tools.
      </Text>

      <Section style={receiptBoxStyle}>
        <Text style={receiptTitleStyle}>Order Summary</Text>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td style={receiptLabelStyle}>Plan</td>
            <td style={receiptValueStyle}>{planName}</td>
          </tr>
          <tr>
            <td style={receiptLabelStyle}>Billing Frequency</td>
            <td style={receiptValueStyle}>{amountPaid}</td>
          </tr>
          <tr>
            <td style={receiptLabelStyle}>Next Renewal Date</td>
            <td style={receiptValueStyle}>{renewalDate}</td>
          </tr>
        </table>
      </Section>

      <Section style={ctaContainerStyle}>
        <Button href={dashboardUrl} style={primaryButtonStyle}>
          Open Dashboard →
        </Button>
      </Section>

      {receiptUrl && (
        <Text style={{ textAlign: 'center', margin: '0 0 16px 0' }}>
          <a href={receiptUrl} style={linkStyle}>Download Payment Receipt</a>
        </Text>
      )}

      <Hr style={dividerStyle} />
    </BaseLayout>
  );
};

export default SubscriptionActivated;

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

const linkStyle: React.CSSProperties = {
  color: '#2563EB',
  textDecoration: 'none',
  fontSize: '13px',
  fontWeight: 500,
};

const receiptBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '20px',
  border: '1px solid #E2E8F0',
  margin: '24px 0',
};

const receiptTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 12px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const receiptLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#64748B',
  padding: '6px 0',
};

const receiptValueStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0F172A',
  textAlign: 'right',
  padding: '6px 0',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '24px 0 16px 0',
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

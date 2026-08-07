import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface EscalationAlertProps {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  level: number;
  pendingSince?: string;
  dashboardUrl?: string;
}

export const EscalationAlert: React.FC<EscalationAlertProps> = ({
  businessName = 'Downtown Bistro',
  customerName = 'Sarah M.',
  rating = 1,
  reviewText = 'Worst service ever.',
  level = 1,
  pendingSince = 'Just now',
  dashboardUrl = 'https://onerepute.com/dashboard/reviews',
}) => {
  const stars = '★'.repeat(Math.min(Math.max(rating, 1), 5)) + '☆'.repeat(5 - Math.min(Math.max(rating, 1), 5));

  return (
    <BaseLayout previewText={`Review Escalation - Level ${level} for ${businessName}`}>
      <Heading style={headingStyle}>🚨 Review Escalation Alert (Level {level})</Heading>
      
      <Text style={paragraphStyle}>
        A negative review for <strong>{businessName}</strong> has remained unresolved and is escalated to Level {level}.
      </Text>

      <Section style={reviewBoxStyle}>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td>
              <Text style={starStyle}>{stars}</Text>
            </td>
            <td style={{ textAlign: 'right' }}>
              <Text style={dateStyle}>Pending since: {pendingSince}</Text>
            </td>
          </tr>
        </table>

        <Text style={authorStyle}>{customerName}</Text>
        <Text style={bodyStyle}>"{reviewText}"</Text>
      </Section>

      <Section style={ctaContainerStyle}>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td style={{ textAlign: 'center' }}>
              <Button href={dashboardUrl} style={primaryButtonStyle}>
                Open Review on Dashboard
              </Button>
            </td>
          </tr>
        </table>
      </Section>

      <Hr style={dividerStyle} />
    </BaseLayout>
  );
};

export default EscalationAlert;

const headingStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#DC2626',
  margin: '0 0 20px 0',
  letterSpacing: '-0.5px',
};

const paragraphStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#334155',
  margin: '0 0 16px 0',
};

const reviewBoxStyle: React.CSSProperties = {
  backgroundColor: '#FFF5F5',
  borderRadius: '12px',
  padding: '20px',
  border: '1px solid #FEE2E2',
  margin: '20px 0',
};

const starStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#DC2626',
  margin: '0 0 8px 0',
  letterSpacing: '2px',
};

const dateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#EF4444',
  margin: 0,
};

const authorStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 8px 0',
};

const bodyStyle: React.CSSProperties = {
  fontSize: '14px',
  fontStyle: 'italic',
  color: '#475569',
  margin: 0,
  lineHeight: '20px',
};

const ctaContainerStyle: React.CSSProperties = {
  margin: '28px 0 16px 0',
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#DC2626',
  color: '#FFFFFF',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 20px',
  display: 'inline-block',
  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

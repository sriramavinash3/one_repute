import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface PasswordChangedProps {
  userName: string;
  changeTimestamp?: string;
  deviceDetails?: string;
  securityUrl?: string;
}

export const PasswordChanged: React.FC<PasswordChangedProps> = ({
  userName = 'User',
  changeTimestamp = new Date().toUTCString(),
  deviceDetails = 'Web Browser (Unknown IP)',
  securityUrl = 'https://onerepute.com/settings/security',
}) => {
  return (
    <BaseLayout previewText="Security Alert: Your OneRepute password has been changed.">
      <Heading style={headingStyle}>Password Successfully Changed 🔒</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        This is a security confirmation that the password for your OneRepute account was updated on <strong>{changeTimestamp}</strong> ({deviceDetails}).
      </Text>

      <Section style={infoBoxStyle}>
        <Text style={infoTitleStyle}>Was this you?</Text>
        <Text style={infoDescStyle}>
          If you performed this action, no further steps are needed. Your account is fully secure.
        </Text>
      </Section>

      <Section style={alertBoxStyle}>
        <Text style={alertTitleStyle}>Didn't request this change?</Text>
        <Text style={alertDescStyle}>
          If you did not change your password, someone else may have accessed your account. Please reset your password immediately and contact our security team.
        </Text>
        <Section style={ctaContainerStyle}>
          <Button href={securityUrl} style={dangerButtonStyle}>
            Secure Account Now →
          </Button>
        </Section>
      </Section>

      <Hr style={dividerStyle} />
    </BaseLayout>
  );
};

export default PasswordChanged;

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

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid #E2E8F0',
  margin: '20px 0',
};

const infoTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 4px 0',
};

const infoDescStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
  lineHeight: '18px',
};

const alertBoxStyle: React.CSSProperties = {
  backgroundColor: '#FEF2F2',
  borderRadius: '10px',
  padding: '20px',
  border: '1px solid #FCA5A5',
  margin: '20px 0',
};

const alertTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#991B1B',
  margin: '0 0 4px 0',
};

const alertDescStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#7F1D1D',
  margin: '0 0 16px 0',
  lineHeight: '18px',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center',
};

const dangerButtonStyle: React.CSSProperties = {
  backgroundColor: '#DC2626',
  color: '#FFFFFF',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '10px 20px',
  display: 'inline-block',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

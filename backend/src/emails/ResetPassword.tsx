import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface ResetPasswordProps {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({
  userName = 'User',
  resetUrl = 'https://onerepute.com/reset-password?token=example_token',
  expiresInMinutes = 15,
}) => {
  return (
    <BaseLayout previewText="Instructions to reset your OneRepute account password.">
      <Heading style={headingStyle}>Reset your password</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        We received a request to reset the password for your OneRepute account. Click the button below to choose a new password.
      </Text>

      <Section style={ctaContainerStyle}>
        <Button href={resetUrl} style={primaryButtonStyle}>
          Reset Password →
        </Button>
      </Section>

      <Section style={warningBoxStyle}>
        <Text style={warningTitleStyle}>⚠️ Security Warning</Text>
        <Text style={warningDescStyle}>
          This password reset link expires in <strong>{expiresInMinutes} minutes</strong> and can only be used once. If you did not request a password reset, please ignore this email or contact support if you suspect unauthorized access.
        </Text>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        If the button above does not work, copy and paste this link into your web browser:
        <br />
        <a href={resetUrl} style={linkStyle}>{resetUrl}</a>
      </Text>
    </BaseLayout>
  );
};

export default ResetPassword;

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
  fontSize: '12px',
  lineHeight: '18px',
  color: '#64748B',
  wordBreak: 'break-all',
  margin: '16px 0 0 0',
};

const linkStyle: React.CSSProperties = {
  color: '#2563EB',
  textDecoration: 'none',
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

const warningBoxStyle: React.CSSProperties = {
  backgroundColor: '#FFFBEB',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid #FCD34D',
  margin: '24px 0',
};

const warningTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#92400E',
  margin: '0 0 4px 0',
};

const warningDescStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#78350F',
  margin: 0,
  lineHeight: '18px',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

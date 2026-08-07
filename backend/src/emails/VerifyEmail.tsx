import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface VerifyEmailProps {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({
  userName = 'User',
  verificationUrl = 'https://onerepute.com/verify?token=example_token',
  expiresInHours = 24,
}) => {
  return (
    <BaseLayout previewText="Verify your email address to activate your OneRepute account.">
      <Heading style={headingStyle}>Verify your email address</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        Thank you for signing up for OneRepute. Please confirm your email address by clicking the button below to complete your registration and secure your workspace.
      </Text>

      <Section style={ctaContainerStyle}>
        <Button href={verificationUrl} style={primaryButtonStyle}>
          Verify Email Address →
        </Button>
      </Section>

      <Section style={noticeBoxStyle}>
        <Text style={noticeTitleStyle}>🔒 Security & Link Expiry</Text>
        <Text style={noticeDescStyle}>
          This verification link is valid for <strong>{expiresInHours} hours</strong>. If you did not create a OneRepute account, you can safely ignore this email.
        </Text>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        If the button above does not work, copy and paste this link into your web browser:
        <br />
        <a href={verificationUrl} style={linkStyle}>{verificationUrl}</a>
      </Text>
    </BaseLayout>
  );
};

export default VerifyEmail;

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

const noticeBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid #E2E8F0',
  margin: '24px 0',
};

const noticeTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 4px 0',
};

const noticeDescStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
  lineHeight: '18px',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

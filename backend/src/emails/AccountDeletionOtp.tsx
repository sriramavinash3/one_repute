import * as React from 'react';
import { Heading, Text, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface AccountDeletionOtpProps {
  userName?: string;
  otpCode: string;
  expiresInMinutes?: number;
}

export const AccountDeletionOtp: React.FC<AccountDeletionOtpProps> = ({
  userName = 'User',
  otpCode = '000000',
  expiresInMinutes = 10,
}) => {
  return (
    <BaseLayout previewText="Your OneRepute account deletion verification code">
      <Heading style={headingStyle}>Confirm Account Deletion</Heading>
      
      <Text style={paragraphStyle}>Hi {userName},</Text>
      
      <Text style={paragraphStyle}>
        We received a request to permanently delete your OneRepute account and all associated data.
      </Text>

      <Text style={warningTextStyle}>
        ⚠️ <strong>Warning:</strong> Account deletion is permanent and cannot be undone. All outlets, customer data, and connected services will be permanently removed.
      </Text>

      <Section style={otpContainerStyle}>
        <Text style={otpLabelStyle}>VERIFICATION CODE</Text>
        <Text style={otpCodeStyle}>{otpCode}</Text>
        <Text style={expiryTextStyle}>This code expires in {expiresInMinutes} minutes.</Text>
      </Section>

      <Section style={noticeBoxStyle}>
        <Text style={noticeTitleStyle}>🔒 Didn't request account deletion?</Text>
        <Text style={noticeDescStyle}>
          If you did not request this deletion, please ignore this email and immediately change your OneRepute password to keep your account safe.
        </Text>
      </Section>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        OneRepute Security Operations • Automated Security Notification
      </Text>
    </BaseLayout>
  );
};

export default AccountDeletionOtp;

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
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

const warningTextStyle: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#B91C1C',
  backgroundColor: '#FEF2F2',
  padding: '12px 16px',
  borderRadius: '8px',
  borderLeft: '4px solid #EF4444',
  margin: '16px 0 24px 0',
};

const otpContainerStyle: React.CSSProperties = {
  textAlign: 'center',
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '24px 16px',
  border: '1px border #E2E8F0',
  margin: '24px 0',
};

const otpLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#64748B',
  letterSpacing: '1.5px',
  margin: '0 0 8px 0',
};

const otpCodeStyle: React.CSSProperties = {
  fontSize: '36px',
  fontWeight: 800,
  color: '#0F172A',
  letterSpacing: '6px',
  margin: '0 0 8px 0',
  fontFamily: 'monospace',
};

const expiryTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
};

const noticeBoxStyle: React.CSSProperties = {
  backgroundColor: '#FFFBEB',
  borderRadius: '10px',
  padding: '16px 20px',
  border: '1px solid #FCD34D',
  margin: '24px 0',
};

const noticeTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#92400E',
  margin: '0 0 4px 0',
};

const noticeDescStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#B45309',
  margin: 0,
  lineHeight: '18px',
};

const paragraphSubStyle: React.CSSProperties = {
  fontSize: '11px',
  lineHeight: '16px',
  color: '#94A3B8',
  margin: '16px 0 0 0',
  textAlign: 'center',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

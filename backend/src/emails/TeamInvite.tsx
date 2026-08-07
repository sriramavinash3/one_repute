import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface TeamInviteProps {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  role?: string;
  expiresInDays?: number;
}

export const TeamInvite: React.FC<TeamInviteProps> = ({
  inviterName = 'Alex',
  workspaceName = 'Acme Inc.',
  inviteUrl = 'https://onerepute.com/invite/accept?token=example_token',
  role = 'Member',
  expiresInDays = 7,
}) => {
  return (
    <BaseLayout previewText={`${inviterName} invited you to join ${workspaceName} on OneRepute.`}>
      <Heading style={headingStyle}>You've been invited to join {workspaceName} 🎉</Heading>
      
      <Text style={paragraphStyle}>
        <strong>{inviterName}</strong> has invited you to collaborate on the <strong>{workspaceName}</strong> workspace as a <strong>{role}</strong> on OneRepute.
      </Text>

      <Section style={inviteBoxStyle}>
        <Text style={inviteTitleStyle}>Workspace Details</Text>
        <Text style={inviteDetailStyle}><strong>Workspace:</strong> {workspaceName}</Text>
        <Text style={inviteDetailStyle}><strong>Assigned Role:</strong> {role}</Text>
        <Text style={inviteDetailStyle}><strong>Invited By:</strong> {inviterName}</Text>
      </Section>

      <Section style={ctaContainerStyle}>
        <Button href={inviteUrl} style={primaryButtonStyle}>
          Accept Invitation & Join →
        </Button>
      </Section>

      <Text style={paragraphSubStyle}>
        This invitation link will expire in <strong>{expiresInDays} days</strong>. If you do not wish to join this workspace, you can ignore this email.
      </Text>

      <Hr style={dividerStyle} />

      <Text style={paragraphSubStyle}>
        If the button above does not work, copy and paste this link into your web browser:
        <br />
        <a href={inviteUrl} style={linkStyle}>{inviteUrl}</a>
      </Text>
    </BaseLayout>
  );
};

export default TeamInvite;

const headingStyle: React.CSSProperties = {
  fontSize: '22px',
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

const inviteBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  padding: '18px 20px',
  border: '1px solid #E2E8F0',
  margin: '20px 0',
};

const inviteTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 8px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inviteDetailStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#475569',
  margin: '0 0 4px 0',
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

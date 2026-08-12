import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Img,
  Preview,
  Font,
} from '@react-email/components';

export interface LayoutProps {
  previewText: string;
  children: React.ReactNode;
  supportEmail?: string;
  appUrl?: string;
  companyAddress?: string;
}

export const BaseLayout: React.FC<LayoutProps> = ({
  previewText,
  children,
  supportEmail = 'support@onerepute.com',
  appUrl = 'https://onerepute.com',
  companyAddress = process.env.COMPANY_ADDRESS || '',
}) => {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <style>{`
          @media (prefers-color-scheme: dark) {
            .email-body { background-color: #0F172A !important; color: #F8FAFC !important; }
            .card-bg { background-color: #1E293B !important; border-color: #334155 !important; }
            .text-main { color: #F8FAFC !important; }
            .text-sub { color: #94A3B8 !important; }
            .border-sub { border-color: #334155 !important; }
            .metric-box { background-color: #0F172A !important; }
          }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={mainBodyStyle} className="email-body">
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0">
              <tr>
                <td style={{ textAlign: 'left' }}>
                  <span style={logoBadgeStyle}>OneRepute</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Text style={headerSubtextStyle} className="text-sub">Reputation OS</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Card Content */}
          <Section style={cardStyle} className="card-bg">
            {children}
          </Section>

          {/* Footer */}
          <Section style={footerSectionStyle}>
            <Text style={footerTextStyle} className="text-sub">
              Need help? Reach out to us at{' '}
              <Link href={`mailto:${supportEmail}`} style={footerLinkStyle}>
                {supportEmail}
              </Link>
            </Text>
            <Text style={footerSubTextStyle} className="text-sub">
              {companyAddress ? `${companyAddress} • ` : ''}<Link href={appUrl} style={footerLinkStyle}>OneRepute Inc.</Link>
            </Text>
            <Text style={socialLinksStyle} className="text-sub">
              <Link href={`${appUrl}/privacy`} style={footerLinkStyle}>Privacy Policy</Link> •{' '}
              <Link href={`${appUrl}/terms`} style={footerLinkStyle}>Terms of Service</Link> •{' '}
              <Link href={`${appUrl}/preferences`} style={footerLinkStyle}>Email Preferences</Link>
            </Text>
            <Text style={legalFooterStyle} className="text-sub">
              © {new Date().getFullYear()} OneRepute. All rights reserved. You are receiving this transactional email because of your account activity.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Shared Inline Styles for Email Client Compatibility
const mainBodyStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: '40px 0',
  width: '100%',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '580px',
  margin: '0 auto',
  padding: '0 20px',
};

const headerSectionStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const logoBadgeStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 800,
  color: '#2563EB',
  letterSpacing: '-0.5px',
};

const headerSubtextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '1px',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  padding: '40px',
  border: '1px solid #E2E8F0',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.04), 0 8px 10px -6px rgba(0,0,0,0.02)',
};

const footerSectionStyle: React.CSSProperties = {
  marginTop: '32px',
  textAlign: 'center',
};

const footerTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#64748B',
  margin: '0 0 8px 0',
};

const footerSubTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94A3B8',
  margin: '0 0 12px 0',
};

const footerLinkStyle: React.CSSProperties = {
  color: '#2563EB',
  textDecoration: 'none',
  fontWeight: 500,
};

const socialLinksStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94A3B8',
  margin: '0 0 16px 0',
};

const legalFooterStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#CBD5E1',
  margin: 0,
  lineHeight: '16px',
};

import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface WeeklyReportProps {
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  analyticsUrl?: string;
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({
  businessName = 'Downtown Bistro',
  reportPeriod = 'Jul 28 - Aug 03, 2026',
  totalReviews = 42,
  averageRating = 4.8,
  responseRate = '98%',
  positiveSentimentPct = 95,
  analyticsUrl = 'https://onerepute.com/analytics',
}) => {
  return (
    <BaseLayout previewText={`Weekly Reputation Report for ${businessName}: ${averageRating} ★ average rating across ${totalReviews} new reviews.`}>
      <Heading style={headingStyle}>Weekly Reputation Performance 📊</Heading>
      
      <Text style={paragraphStyle}>
        Here is your reputation snapshot for <strong>{businessName}</strong> for the week of <strong>{reportPeriod}</strong>.
      </Text>

      {/* Metrics Grid */}
      <Section style={gridSectionStyle}>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td style={metricCardStyle}>
              <Text style={metricValueStyle}>{totalReviews}</Text>
              <Text style={metricLabelStyle}>New Reviews</Text>
            </td>
            <td style={{ width: '12px' }}></td>
            <td style={metricCardStyle}>
              <Text style={{ ...metricValueStyle, color: '#D97706' }}>{averageRating} ★</Text>
              <Text style={metricLabelStyle}>Avg Rating</Text>
            </td>
          </tr>
          <tr><td height="12"></td></tr>
          <tr>
            <td style={metricCardStyle}>
              <Text style={{ ...metricValueStyle, color: '#059669' }}>{responseRate}</Text>
              <Text style={metricLabelStyle}>Response Rate</Text>
            </td>
            <td style={{ width: '12px' }}></td>
            <td style={metricCardStyle}>
              <Text style={{ ...metricValueStyle, color: '#2563EB' }}>{positiveSentimentPct}%</Text>
              <Text style={metricLabelStyle}>Positive Sentiment</Text>
            </td>
          </tr>
        </table>
      </Section>

      <Section style={ctaContainerStyle}>
        <Button href={analyticsUrl} style={primaryButtonStyle}>
          View Full Analytics →
        </Button>
      </Section>

      <Hr style={dividerStyle} />
    </BaseLayout>
  );
};

export default WeeklyReport;

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

const gridSectionStyle: React.CSSProperties = {
  margin: '24px 0',
};

const metricCardStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center',
  border: '1px solid #E2E8F0',
  width: '48%',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 800,
  color: '#0F172A',
  margin: '0 0 4px 0',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748B',
  margin: 0,
  textTransform: 'uppercase',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '24px 0',
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

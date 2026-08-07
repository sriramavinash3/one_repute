import * as React from 'react';
import { Heading, Text, Button, Section, Hr } from '@react-email/components';
import { BaseLayout } from './components/Layout';

export interface ReviewAlertProps {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
  dashboardUrl?: string;
  aiReplyUrl?: string;
}

export const ReviewAlert: React.FC<ReviewAlertProps> = ({
  businessName = 'Downtown Bistro',
  customerName = 'Sarah M.',
  rating = 5,
  reviewText = 'The food was outstanding and the ambiance was top-notch! We will definitely be coming back again next weekend.',
  reviewDate = 'Just now',
  dashboardUrl = 'https://onerepute.com/dashboard/reviews',
  aiReplyUrl = 'https://onerepute.com/dashboard/reviews?action=ai-reply',
}) => {
  const stars = '★'.repeat(Math.min(Math.max(rating, 1), 5)) + '☆'.repeat(5 - Math.min(Math.max(rating, 1), 5));
  const isPositive = rating >= 4;

  return (
    <BaseLayout previewText={`New ${rating}-Star Review for ${businessName} from ${customerName}`}>
      <Heading style={headingStyle}>New Review Received 💬</Heading>
      
      <Text style={paragraphStyle}>
        A customer just posted a new review for <strong>{businessName}</strong>.
      </Text>

      <Section style={reviewBoxStyle}>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td>
              <Text style={{ ...starStyle, color: isPositive ? '#D97706' : '#DC2626' }}>{stars}</Text>
            </td>
            <td style={{ textAlign: 'right' }}>
              <Text style={dateStyle}>{reviewDate}</Text>
            </td>
          </tr>
        </table>

        <Text style={authorStyle}>{customerName}</Text>
        <Text style={bodyStyle}>"{reviewText}"</Text>
      </Section>

      <Section style={ctaContainerStyle}>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tr>
            <td style={{ textAlign: 'center', paddingRight: '8px' }}>
              <Button href={aiReplyUrl} style={primaryButtonStyle}>
                🤖 Generate AI Reply
              </Button>
            </td>
            <td style={{ textAlign: 'center', paddingLeft: '8px' }}>
              <Button href={dashboardUrl} style={secondaryButtonStyle}>
                Open Dashboard
              </Button>
            </td>
          </tr>
        </table>
      </Section>

      <Hr style={dividerStyle} />
    </BaseLayout>
  );
};

export default ReviewAlert;

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

const reviewBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '12px',
  padding: '20px',
  border: '1px solid #E2E8F0',
  margin: '20px 0',
};

const starStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 8px 0',
  letterSpacing: '2px',
};

const dateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94A3B8',
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
  backgroundColor: '#2563EB',
  color: '#FFFFFF',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 20px',
  display: 'inline-block',
  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
};

const secondaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#F1F5F9',
  color: '#0F172A',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 20px',
  display: 'inline-block',
  border: '1px solid #CBD5E1',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  margin: '24px 0',
};

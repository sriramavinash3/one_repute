import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { fetchReviews } from '../../services/reviewService';
import { fetchAdminOutlets } from '../../services/outletService';
import { fetchAdminCustomers, normalizeCustomers } from '../../services/adminService';
import { USE_MOCK_DATA } from '../../config/env';
import { MOCK_REVIEWS, MOCK_OUTLETS, MOCK_CUSTOMERS } from '../../config/mockData';
import { BrainCircuit, AlertTriangle, TrendingDown, Star, Sparkles, Frown, MessageSquareWarning } from 'lucide-react';
import { Card } from '../../components/ui/card';
import Skeleton from '../../components/feedback/Skeleton';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
};

export default function AdminIntelligencePage() {
  const { data: reviewsPayload, isLoading: reviewsLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { reviews: MOCK_REVIEWS };
      return fetchReviews({ limit: 1000 });
    }
  });

  const { data: outletPayload, isLoading: outletsLoading } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS };
      return fetchAdminOutlets();
    }
  });

  const { data: rawCustomers, isLoading: customersLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      return fetchAdminCustomers()
    }
  });

  const customers = useMemo(() => {
    return normalizeCustomers(rawCustomers)
  }, [rawCustomers]);

  const isLoading = reviewsLoading || outletsLoading || customersLoading;

  const insights = useMemo(() => {
    const reviews = reviewsPayload?.reviews || reviewsPayload?.data || [];
    const outlets = outletPayload?.outlets || [];
    
    // Top Complaints
    const issueCounts = {};
    const emotionCounts = {};
    const outletRisks = {}; // Track negative reviews per outlet

    reviews.forEach(r => {
      if (r.issueCategory && r.issueCategory !== 'None') {
        issueCounts[r.issueCategory] = (issueCounts[r.issueCategory] || 0) + 1;
      }
      if (r.emotion) {
        emotionCounts[r.emotion] = (emotionCounts[r.emotion] || 0) + 1;
      }
      if (r.rating <= 2) {
        outletRisks[r.outletId] = (outletRisks[r.outletId] || 0) + 1;
      }
    });

    const topComplaints = Object.entries(issueCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topEmotions = Object.entries(emotionCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const riskRankings = Object.entries(outletRisks)
      .map(([outletId, negativeCount]) => {
        const outlet = outlets.find(o => o.id === outletId);
        const customer = customers.find(c => c.id === outlet?.customerId);
        return {
          outletName: outlet?.name || 'Unknown',
          customerName: customer?.name || 'Unknown',
          negativeCount
        };
      })
      .sort((a, b) => b.negativeCount - a.negativeCount)
      .slice(0, 5);

    return { topComplaints, topEmotions, riskRankings };
  }, [reviewsPayload, outletPayload, customers]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6 pb-12" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900 flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-indigo-600" />
            Reputation Intelligence
          </h2>
          <p className="text-sm text-slatey-500 mt-1">AI-driven patterns across all customers and outlets calculated from raw review data.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Top Complaints */}
        <motion.div variants={item}>
          <Card className="p-5 border-none shadow-glow h-full">
            <h3 className="text-sm font-semibold text-rose-700 bg-rose-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Top Complaints
            </h3>
            {insights.topComplaints.length > 0 ? (
              <div className="space-y-3">
                {insights.topComplaints.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slatey-50/50 hover:bg-slatey-50 transition-colors border border-slatey-100">
                    <span className="text-sm font-medium text-slatey-800">{c.name}</span>
                    <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded">{c.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slatey-500 mt-4 text-center">No complaints detected.</p>
            )}
          </Card>
        </motion.div>

        {/* Emotions */}
        <motion.div variants={item}>
          <Card className="p-5 border-none shadow-glow h-full">
            <h3 className="text-sm font-semibold text-indigo-700 bg-indigo-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Detected Emotions
            </h3>
            {insights.topEmotions.length > 0 ? (
              <div className="space-y-3">
                {insights.topEmotions.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slatey-50/50 hover:bg-slatey-50 transition-colors border border-slatey-100">
                    <span className="text-sm font-medium text-slatey-800">{e.name}</span>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{e.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slatey-500 mt-4 text-center">No emotions detected.</p>
            )}
          </Card>
        </motion.div>

        {/* Risk Rankings */}
        <motion.div variants={item}>
          <Card className="p-5 border-none shadow-glow h-full">
            <h3 className="text-sm font-semibold text-amber-700 bg-amber-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
              <TrendingDown className="h-4 w-4" /> Outlet Risk Rankings
            </h3>
            <p className="text-xs text-slatey-500 mb-3">Outlets with the most negative reviews (≤2 stars).</p>
            {insights.riskRankings.length > 0 ? (
              <div className="space-y-3">
                {insights.riskRankings.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slatey-50/50 hover:bg-slatey-50 transition-colors border border-slatey-100">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slatey-900">{r.outletName}</span>
                      <span className="text-[10px] text-slatey-500">{r.customerName}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                      <Frown className="h-3 w-3" /> {r.negativeCount}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slatey-500 mt-4 text-center">No risky outlets detected.</p>
            )}
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

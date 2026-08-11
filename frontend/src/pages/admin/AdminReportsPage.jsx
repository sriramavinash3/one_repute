import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, ExternalLink, Calendar, Search } from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Card } from '../../components/ui/card';
import EmptyState from '../../components/feedback/EmptyState';
import Skeleton from '../../components/feedback/Skeleton';
import { formatTimestamp } from '../../utils/format';
import { USE_MOCK_DATA } from '../../config/env';
import { MOCK_REPORTS } from '../../config/mockData';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

export default function AdminReportsPage() {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_REPORTS;
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  const filteredReports = reports.filter(r => {
    const typeMatch = filter === 'all' || r.period === filter;
    const searchMatch = !searchQuery || (r.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return typeMatch && searchMatch;
  });

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Generated Reports</h2>
          <p className="text-sm text-slatey-500">Monitor all reports generated for customers.</p>
        </div>
      </div>

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 min-w-[280px] items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none"
              placeholder="Search by customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-slatey-100 bg-slatey-50 p-1 dark:border-slatey-800 dark:bg-slatey-950">
              {['all', 'weekly', 'monthly', 'escalation'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    filter === s 
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-slatey-800 dark:text-brand-400' 
                      : 'text-slatey-500 hover:text-slatey-700 dark:text-slatey-400 dark:hover:text-slatey-200'
                  }`}
                >
                  {s === 'escalation' ? 'Escalation' : s === 'all' ? 'All' : s === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredReports.length > 0 ? (
          <div className="rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
              <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500 dark:bg-slatey-900 dark:text-slatey-400">
                <tr>
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Type of Report</th>
                  <th className="px-6 py-4">Generated Date</th>
                  <th className="px-6 py-4 text-right">Link to View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slatey-100 dark:divide-slatey-800/50">
                <AnimatePresence mode="popLayout">
                  {filteredReports.map((report) => (
                    <motion.tr
                      key={report.id}
                      variants={item}
                      layout
                      className="group transition-colors hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30"
                    >
                      <td className="px-6 py-4 font-semibold text-slatey-900 dark:text-slatey-100">
                        {report.customerName || 'Unknown Customer'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          report.period === 'monthly' ? 'bg-indigo-50 text-indigo-700' :
                          report.period === 'weekly' ? 'bg-brand-50 text-brand-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {report.period === 'monthly' ? 'Monthly Report' : report.period === 'weekly' ? 'Weekly Report' : 'Escalation Report'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slatey-600 dark:text-slatey-400">
                        {formatTimestamp(report.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {report.url ? (
                          <a href={report.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition">
                            <ExternalLink className="h-4 w-4" /> View Report
                          </a>
                        ) : (
                          <span className="text-slatey-400">Not Available</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No reports found"
            description="Generated reports will appear here."
            icon={<FileText className="h-8 w-8 text-slatey-300" />}
          />
        )}
      </div>
    </motion.div>
  );
}

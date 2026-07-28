import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Calendar, Download, AlertCircle, ChevronRight, Filter } from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Card } from '../../components/ui/card';
import Button from '../../components/ui/button';
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

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_REPORTS;
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  const filteredReports = reports.filter(r => filter === 'all' || r.period === filter);

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Generated Reports</h2>
          <p className="text-sm text-slatey-500">Timeline of all weekly and monthly performance reports.</p>
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

      <div className="relative border-l-2 border-slatey-100 ml-4 pl-6 dark:border-slatey-800/60">
        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[35px] top-4 h-4 w-4 rounded-full bg-slatey-200 border-4 border-white dark:border-slatey-900" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : filteredReports.length > 0 ? (
          <AnimatePresence mode="popLayout">
            <div className="space-y-6">
              {filteredReports.map((report) => (
                <motion.div key={report.id} variants={item} layout className="relative">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[35px] top-4 h-4 w-4 rounded-full border-4 border-white dark:border-slatey-900 ${
                    report.period === 'monthly' ? 'bg-indigo-500' : report.period === 'escalation' ? 'bg-rose-500' : 'bg-brand-500'
                  }`} />
                  
                  <Card className="p-5 border-none shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          report.period === 'monthly' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                        }`}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slatey-900 dark:text-slatey-100">
                              {report.customerName || 'Unknown Customer'} - {report.period === 'monthly' ? 'Monthly Performance Report' : report.period === 'weekly' ? 'Weekly Performance Report' : 'Escalation Report'}
                            </h3>
                            <span className="text-[10px] rounded-full bg-slatey-100 px-2 py-0.5 font-medium text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
                              {formatTimestamp(report.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slatey-500">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {report.startDate ? new Date(report.startDate.seconds * 1000).toLocaleDateString() : 'N/A'} - {report.endDate ? new Date(report.endDate.seconds * 1000).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {report.url && (
                          <a href={report.url} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="hidden sm:flex">
                              <Download className="mr-2 h-4 w-4" /> Download PDF
                            </Button>
                            <Button variant="outline" size="sm" className="sm:hidden px-2">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        ) : (
          <div className="pt-4">
            <EmptyState
              title="No reports found"
              description="Generated reports will appear here in a timeline format."
              icon={<FileText className="h-8 w-8 text-slatey-300" />}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { USE_MOCK_DATA } from '../../config/env';
import { MOCK_TICKETS } from '../../config/mockData';
import AdminLayout from '../../layouts/AdminLayout';

export default function AdminTicketsPage() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_TICKETS;
      const snap = await getDocs(collection(db, 'tickets'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tickets</h1>
      {isLoading ? <p>Loading...</p> : (
        <div className="overflow-x-auto rounded-xl border border-slatey-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slatey-50">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id} className="border-t border-slatey-100">
                  <td className="px-4 py-2 font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-2">{t.subject}</td>
                  <td className="px-4 py-2">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

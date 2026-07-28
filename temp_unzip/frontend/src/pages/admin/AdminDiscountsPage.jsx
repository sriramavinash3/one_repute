import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { USE_MOCK_DATA } from '../../config/env';
import { MOCK_DISCOUNTS } from '../../config/mockData';

export default function AdminDiscountsPage() {
  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['admin-discounts'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_DISCOUNTS;
      const snap = await getDocs(collection(db, 'discounts'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Discounts</h1>
      {isLoading ? <p>Loading...</p> : (
        <div className="overflow-x-auto rounded-xl border border-slatey-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slatey-50">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map(d => (
                <tr key={d.id} className="border-t border-slatey-100">
                  <td className="px-4 py-2 font-mono font-bold">{d.code}</td>
                  <td className="px-4 py-2">{d.value}{d.type === 'percentage' ? '%' : '$'}</td>
                  <td className="px-4 py-2">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

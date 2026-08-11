import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../services/apiClient';

export default function AdminDiscountsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage',
    value: '',
    status: 'Active'
  });

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['admin-discounts'],
    queryFn: async () => {
      const res = await apiClient.get('/api/discounts');
      return res.data;
    }
  });

  const createDiscount = useMutation({
    mutationFn: async (newDiscount) => {
      await apiClient.post('/api/discounts', newDiscount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-discounts']);
      setIsModalOpen(false);
      setFormData({ code: '', type: 'percentage', value: '', status: 'Active' });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createDiscount.mutate({
      ...formData,
      value: Number(formData.value)
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Discount Creator & Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Manage Razorpay coupon codes</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          + Create Discount
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-12 bg-slate-200 rounded-xl"></div>
          <div className="h-12 bg-slate-200 rounded-xl"></div>
        </div>
      ) : (
        <div className="bg-white overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700">Code</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Type</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Value</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Uses</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discounts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">No discounts created yet.</td>
                </tr>
              ) : discounts.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-800">{d.code}</td>
                  <td className="px-6 py-4 capitalize text-slate-600">{d.type}</td>
                  <td className="px-6 py-4 font-medium text-emerald-600">
                    {d.type === 'percentage' ? `${d.value}% OFF` : `$${d.value} OFF`}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{d.currentUses || 0}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${d.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-slate-800 mb-6">Create New Discount</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. SUMMER20"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none uppercase"
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat">Flat Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    max={formData.type === 'percentage' ? "100" : undefined}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    value={formData.value}
                    onChange={e => setFormData({...formData, value: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createDiscount.isPending}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors flex items-center disabled:opacity-50"
                >
                  {createDiscount.isPending ? 'Saving...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../services/apiClient';

export default function AdminTicketsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'Open'
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const res = await apiClient.get('/api/tickets');
      return res.data;
    }
  });

  const createTicket = useMutation({
    mutationFn: async (newTicket) => {
      await apiClient.post('/api/tickets', newTicket);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-tickets']);
      setIsModalOpen(false);
      setFormData({ title: '', description: '', status: 'Open' });
    }
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      await apiClient.put(`/api/tickets/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-tickets']);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createTicket.mutate(formData);
  };

  const getStatusColor = (status) => {
    if (status === 'Resolved') return 'bg-emerald-100 text-emerald-700';
    if (status === 'In_Progress') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tickets (Queries)</h1>
          <p className="text-sm text-slate-500 mt-1">Raise and track customer support requests</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          + Raise Ticket
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-12 bg-slate-200 rounded-xl"></div>
          <div className="h-24 bg-slate-200 rounded-xl"></div>
        </div>
      ) : (
        <div className="bg-white overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700">Ticket Details</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Created At</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-slate-500">No tickets found.</td>
                </tr>
              ) : tickets.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    <p className="text-slate-500 mt-1">{t.description}</p>
                    <p className="text-xs text-slate-400 font-mono mt-2">ID: {t.id}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                    {t.createdAt ? new Date(t.createdAt._seconds ? t.createdAt._seconds * 1000 : t.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      className="text-sm border border-slate-300 rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-primary-500"
                      value={t.status}
                      onChange={(e) => updateTicketStatus.mutate({ id: t.id, status: e.target.value })}
                    >
                      <option value="Open">Open</option>
                      <option value="In_Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-slate-800 mb-6">Raise New Ticket</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject / Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Issue with WhatsApp alerts"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                  required
                  rows="4"
                  placeholder="Describe the issue in detail..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createTicket.isPending}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {createTicket.isPending ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

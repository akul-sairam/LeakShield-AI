"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Settings, Plus, Trash2 } from 'lucide-react';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    rule_type: 'semantic',
    action: 'block',
    threshold: 0.85,
    regex_pattern: ''
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = () => {
    api.get('/policies').then(res => setPolicies(res.data)).catch(console.error);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...formData };
      if (payload.rule_type === 'regex') delete payload.threshold;
      if (payload.rule_type === 'semantic') delete payload.regex_pattern;
      
      await api.post('/policies', payload);
      fetchPolicies();
      // Reset form (simplified)
      setFormData({ ...formData, name: '', regex_pattern: '' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center">
          <Settings className="w-5 h-5 mr-2 text-indigo-400" />
          Policy Editor
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-fit">
          <h3 className="text-lg font-medium text-white mb-4">Create New Rule</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Policy Name</label>
              <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Department</label>
              <input required value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="*" className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Rule Type</label>
                <select value={formData.rule_type} onChange={e => setFormData({...formData, rule_type: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">
                  <option value="semantic">Semantic</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select value={formData.action} onChange={e => setFormData({...formData, action: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white">
                  <option value="block">Block</option>
                  <option value="warn">Warn</option>
                </select>
              </div>
            </div>
            {formData.rule_type === 'semantic' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Threshold (0.0 - 1.0)</label>
                <input type="number" step="0.01" value={formData.threshold} onChange={e => setFormData({...formData, threshold: parseFloat(e.target.value)})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
              </div>
            )}
            {formData.rule_type === 'regex' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Regex Pattern</label>
                <input required value={formData.regex_pattern} onChange={e => setFormData({...formData, regex_pattern: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-white" />
              </div>
            )}
            <button type="submit" className="w-full flex items-center justify-center py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors">
              <Plus className="w-4 h-4 mr-2" />
              Deploy Policy
            </button>
          </form>
        </div>

        {/* List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
          <h3 className="text-lg font-medium text-white mb-4">Active Policies</h3>
          <div className="space-y-3">
            {policies.map(p => (
              <div key={p.id} className="flex items-center justify-between p-4 bg-gray-950 border border-gray-800 rounded-lg">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-300 rounded">{p.department}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${p.rule_type === 'semantic' ? 'bg-purple-500/10 text-purple-400' : 'bg-orange-500/10 text-orange-400'}`}>
                      {p.rule_type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {p.rule_type === 'semantic' ? `Threshold: ${p.threshold}` : `Pattern: ${p.regex_pattern}`}
                    {' • '}Action: <span className="font-medium text-red-400">{p.action.toUpperCase()}</span>
                  </p>
                </div>
              </div>
            ))}
            {policies.length === 0 && <p className="text-gray-500 text-sm">No policies defined.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

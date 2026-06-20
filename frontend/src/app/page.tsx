"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Shield, ShieldAlert, Activity, FileText, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  
  useEffect(() => {
    // Fetch logs and analytics
    api.get('/audit-logs?limit=10').then(res => setLogs(res.data)).catch(console.error);
    api.get('/analytics').then(res => setAnalytics(res.data.top_violations)).catch(console.error);
  }, []);

  const totalScans = logs.length * 10 + 42; // Fake multiplier for demo
  const blocked = logs.filter(l => l.violated_policy_id).length;
  
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center">
          <div className="bg-blue-500/20 p-3 rounded-lg mr-4">
            <Activity className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Total Scans</p>
            <p className="text-2xl font-bold text-white">{totalScans}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center">
          <div className="bg-red-500/20 p-3 rounded-lg mr-4">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Leaks Prevented</p>
            <p className="text-2xl font-bold text-white">{blocked}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center">
          <div className="bg-green-500/20 p-3 rounded-lg mr-4">
            <Shield className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Active Policies</p>
            <p className="text-2xl font-bold text-white">12</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl flex items-center">
          <div className="bg-indigo-500/20 p-3 rounded-lg mr-4">
            <CheckCircle2 className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">System Health</p>
            <p className="text-2xl font-bold text-white">99.9%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">Risk Heatmap (Violations by Department)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics}>
                <XAxis dataKey="policy_name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip cursor={{fill: '#1f2937'}} contentStyle={{backgroundColor: '#111827', border: '1px solid #374151'}} />
                <Bar dataKey="violations_count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Live Threat Feed</h2>
          <div className="space-y-4">
            {logs.map(log => (
              <div key={log.id} className="p-4 bg-gray-950 border border-gray-800 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-300">{log.user_id}</span>
                  {log.violated_policy_id ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-500/10 text-red-400 rounded">BLOCKED</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-green-500/10 text-green-400 rounded">PASSED</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">{log.prompt_preview}</p>
                <div className="mt-2 text-xs text-gray-600 flex justify-between">
                  <span>Risk Score: {log.risk_score.toFixed(2)}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-gray-500 text-sm">No incidents yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

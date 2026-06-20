"use client";

import { useState } from 'react';
import { api } from '@/lib/api';
import { UploadCloud, Database } from 'lucide-react';

export default function VaultPage() {
  const [secrets, setSecrets] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleIngest = async () => {
    if (!secrets.trim()) return;
    setLoading(true);
    setMessage("");
    
    try {
      const docList = secrets.split('\n\n').filter(s => s.trim().length > 0);
      const res = await api.post('/ingest', { secrets: docList });
      setMessage(`Success! ${res.data.total_chunks} chunks added to the Negative RAG Vault.`);
      setSecrets("");
    } catch (err: any) {
      setMessage(`Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
          <Database className="w-5 h-5 mr-2 text-indigo-400" />
          Vault Manager
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Paste internal company documents here. They will be chunked and embedded into the Negative RAG database to prevent AI leaks. Use double newlines to separate documents.
        </p>

        <textarea
          className="w-full h-64 bg-gray-950 border border-gray-800 rounded-lg p-4 text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors resize-none mb-4"
          placeholder="e.g. Project Orion Master Password is Hunter2_Orion!..."
          value={secrets}
          onChange={e => setSecrets(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <button
            onClick={handleIngest}
            disabled={loading || !secrets.trim()}
            className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            {loading ? "Processing..." : "Ingest Documents"}
          </button>
          {message && (
            <span className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

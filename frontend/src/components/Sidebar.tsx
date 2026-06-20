import Link from 'next/link';
import { LayoutDashboard, Database, ShieldAlert, Settings } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 text-gray-300 flex flex-col h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <ShieldAlert className="w-6 h-6 text-indigo-500 mr-3" />
        <span className="font-bold text-lg text-white tracking-wide">LeakShield</span>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/" className="flex items-center px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-800 hover:text-white transition-colors">
          <LayoutDashboard className="w-5 h-5 mr-3 text-gray-400" />
          Command Center
        </Link>
        <Link href="/vault" className="flex items-center px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-800 hover:text-white transition-colors">
          <Database className="w-5 h-5 mr-3 text-gray-400" />
          Vault Management
        </Link>
        <Link href="/policies" className="flex items-center px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-800 hover:text-white transition-colors">
          <Settings className="w-5 h-5 mr-3 text-gray-400" />
          Policy Editor
        </Link>
      </nav>
      
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
            AD
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Admin User</p>
            <p className="text-xs text-gray-500">Security Officer</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

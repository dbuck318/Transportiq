import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { Users, ClipboardCheck, Calendar, Shield, ExternalLink, Download, ShieldCheck, Settings, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVersionMonitor } from '../hooks/useVersionMonitor';
import AdminManagerModal from './AdminManagerModal';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: any;
  lastLogin: any;
}

interface AdminPanelProps {
  isSuperAdmin?: boolean;
  currentUserUid?: string;
}

export default function AdminPanel({ isSuperAdmin, currentUserUid }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManager, setShowManager] = useState(false);
  const { currentVersion } = useVersionMonitor();

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setUsers(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });
  }, []);

  const triggerWeeklyReport = async () => {
    try {
      const response = await fetch('/api/admin/trigger-report', { method: 'POST' });
      if (response.ok) {
        alert('Weekly report triggered and sent to administrators.');
      } else {
        alert('Failed to trigger report.');
      }
    } catch (err) {
      console.error(err);
      alert('Error triggering report.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Administrative Hub</h2>
          <p className="text-[10px] font-mono opacity-40 uppercase">Fleet Management // Admin Access Active</p>
        </div>
        
        <div className="flex gap-3">
          {isSuperAdmin && (
            <button 
              onClick={() => setShowManager(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded text-[10px] font-bold uppercase hover:bg-black transition-colors shadow-lg"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400" /> Manage Admins
            </button>
          )}
          
          <button 
            onClick={triggerWeeklyReport}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-colors shadow-lg"
          >
            <ClipboardCheck className="w-3 h-3" /> Trigger Weekly Digest
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showManager && currentUserUid && (
          <AdminManagerModal 
            onClose={() => setShowManager(false)} 
            currentUserUid={currentUserUid}
          />
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-tight">Total Operators</h3>
          </div>
          <p className="text-3xl font-mono font-black text-slate-900">{users.length}</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Active Accounts</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg text-green-600">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-tight">Access Level</h3>
          </div>
          <p className="text-lg font-mono font-bold text-slate-900">SYSTEM_ADMIN</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Verified Credentials</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-tight">Software Build</h3>
          </div>
          <p className="text-lg font-mono font-bold text-slate-900">{currentVersion || 'v1.4.15-dev'}</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Global CDN Version</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operator Registration Log</h3>
          <span className="text-[9px] font-mono text-slate-400 capitalize">Real-time sync enabled</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Operator</th>
                <th className="p-4 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Fleet Email</th>
                <th className="p-4 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Registered</th>
                <th className="p-4 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Last Activity</th>
                <th className="p-4 text-[10px] font-bold uppercase text-slate-400 tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-600 uppercase border border-slate-200">
                        {u.displayName?.substring(0, 2) || (u.email?.substring(0,2) ?? '??')}
                      </div>
                      <span className="font-bold text-slate-700">{u.displayName || 'Unnamed Operator'}</span>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-slate-500">{u.email}</td>
                  <td className="p-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'Historical'}
                    </div>
                  </td>
                  <td className="p-4 text-slate-500">
                    {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : '---'}
                  </td>
                  <td className="p-4 text-right">
                    <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">VERIFIED</span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest italic font-mono">
                    No operator records detected in local cluster.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

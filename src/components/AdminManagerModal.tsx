import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { X, Shield, ShieldCheck, UserPlus, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

interface AdminRecord {
  id: string;
  addedBy: string;
  timestamp: any;
}

interface AdminManagerModalProps {
  onClose: () => void;
  currentUserUid: string;
}

export default function AdminManagerModal({ onClose, currentUserUid }: AdminManagerModalProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [admins, setAdmins] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // Listen to users
    const usersQ = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.data().email || '',
        displayName: doc.data().displayName || ''
      })) as UserProfile[];
      setUsers(userData);
    });

    // Listen to current admins
    const adminsQ = query(collection(db, 'admins'));
    const unsubscribeAdmins = onSnapshot(adminsQ, (snapshot) => {
      const adminMap: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        adminMap[doc.id] = true;
      });
      setAdmins(adminMap);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeAdmins();
    };
  }, []);

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    setProcessingId(userId);
    try {
      if (currentStatus) {
        // Remove admin
        await deleteDoc(doc(db, 'admins', userId));
      } else {
        // Add admin
        await setDoc(doc(db, 'admins', userId), {
          addedBy: currentUserUid,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Failed to update admin status:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[40px] shadow-2xl border border-slate-100 max-w-2xl w-full flex flex-col max-h-[80vh] overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Access Control</h3>
              <p className="text-xs text-slate-500 font-medium tracking-tight">Promote or revoke administrator privileges</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 bg-slate-50 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search via email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all font-medium"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-widest">Scanning local cluster...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(user => {
                const isAdmin = admins[user.id] || false;
                return (
                  <div 
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-[24px] hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase border ${isAdmin ? 'bg-blue-600 text-white border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}>
                        {user.displayName?.charAt(0) || user.email.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{user.displayName || 'No Name Set'}</span>
                        <span className="text-[10px] font-medium text-slate-500">{user.email}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleAdmin(user.id, isAdmin)}
                      disabled={processingId === user.id}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
                        isAdmin 
                          ? 'bg-slate-900 text-white hover:bg-black' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
                      } disabled:opacity-50`}
                    >
                      {processingId === user.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isAdmin ? (
                        <Shield className="w-3 h-3" />
                      ) : (
                        <UserPlus className="w-3 h-3" />
                      )}
                      {isAdmin ? 'Revoke Admin' : 'Grant Admin'}
                    </button>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-sm italic">
                  No operators match your current search parameters.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-1">Super Admin Context Required</p>
          <p className="text-[9px] text-slate-400">Manual verification of secondary admins is strictly enforced per fleet policy.</p>
        </div>
      </motion.div>
    </div>
  );
}

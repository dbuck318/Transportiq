import React, { useEffect, useState } from 'react';
import { auth, logout, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Haul } from './types';
import { LogOut, Shield, AlertCircle, Plus, LayoutDashboard, History, ExternalLink, Key, Fingerprint, Download, Menu, X, Folder, Trash2, GripVertical, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import PickupTrailerIcon from './components/PickupTrailerIcon';
import { motion, AnimatePresence } from 'motion/react';
import ActiveWorkspace from './components/ActiveWorkspace';
import HistoricalTable from './components/HistoricalTable';
import WeeklySummary from './components/WeeklySummary';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import BiometricSettings from './components/BiometricSettings';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useVersionMonitor } from './hooks/useVersionMonitor';
import { RefreshCw } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

const formatRollingVersion = (v: string) => {
  let numVal = parseInt(v, 10);
  if (isNaN(numVal) || v.length < 10) {
    let hash = 0;
    for (let i = 0; i < v.length; i++) {
      hash = (hash * 31 + v.charCodeAt(i)) >>> 0;
    }
    // Mix with a fixed epoch offset so it's a large rolling number
    numVal = hash + 1716000000000;
  }
  
  // Get rolling digits
  const seconds = Math.floor(numVal / 1000);
  const patch = seconds % 100;
  const minor = Math.floor(seconds / 100) % 100;
  const major = Math.floor(seconds / 10000) % 100;
  
  return `v${major.toString().padStart(2, '0')}.${minor.toString().padStart(2, '0')}.${patch.toString().padStart(2, '0')}`;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hauls, setHauls] = useState<Haul[]>([]);
  const [activeHaulId, setActiveHaulId] = useState<string | null>(null);
  const [versionCount, setVersionCount] = useState<number>(0);
  const prevHaulsSignature = React.useRef<string>('');

  const incrementVersion = () => {
    setVersionCount(prev => {
      const next = prev + 1;
      if (user) {
        localStorage.setItem(`lod_version_count_${user.uid}`, next.toString());
        // Save to firestore asynchronously (fire-and-forget)
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { versionCount: next }).catch(err => {
          console.warn("Failed to sync versionCount to firestore:", err);
        });
      }
      return next;
    });
  };

  const major = 1;
  const minor = Math.floor(versionCount / 100);
  const patch = versionCount % 100;
  const displayVersion = `v${major}.${minor.toString().padStart(2, '0')}.${patch.toString().padStart(2, '0')}`;

  const [view, setView] = useState<'dashboard' | 'history' | 'admin' | 'settings'>(() => {
    try {
      return (localStorage.getItem('lod_view') as any) || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('lod_view', view);
    } catch (e) {
      console.warn('Failed to persist view state:', e);
    }
  }, [view]);

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '2m' | '3m' | '1y' | 'all'>('7d');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [draggedFolderIndex, setDraggedFolderIndex] = useState<number | null>(null);
  const [draggedOverFolderIndex, setDraggedOverFolderIndex] = useState<number | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isFoldersExpanded, setIsFoldersExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (user) {
      try {
        const stored = localStorage.getItem(`lod_custom_folders_${user.uid}`);
        setCustomFolders(stored ? JSON.parse(stored) : []);
      } catch {
        setCustomFolders([]);
      }
    } else {
      setCustomFolders([]);
    }
  }, [user]);

  const saveCustomFoldersInApp = (folders: string[], isUserInitiated: boolean = false) => {
    setCustomFolders(folders);
    if (user) {
      try {
        localStorage.setItem(`lod_custom_folders_${user.uid}`, JSON.stringify(folders));
      } catch (e) {
        console.warn('Failed to persist custom folders:', e);
      }
    }
    if (isUserInitiated) {
      incrementVersion();
    }
  };

  const uniqueFoldersInApp = Array.from(
    new Set(
      (hauls || [])
        .filter(h => (h.status === 'Completed' || h.status === 'Finalized') && h.folder)
        .map(h => h.folder!)
    )
  );

  const uniqueFoldersInAppString = JSON.stringify(uniqueFoldersInApp);

  useEffect(() => {
    if (user && uniqueFoldersInApp.length > 0) {
      const parsedUnique = JSON.parse(uniqueFoldersInAppString) as string[];
      const missing = parsedUnique.filter(f => !customFolders.includes(f));
      if (missing.length > 0) {
        saveCustomFoldersInApp([...customFolders, ...missing]);
      }
    }
  }, [uniqueFoldersInAppString, customFolders, user]);

  const allHistoryFolders = customFolders.length > 0 ? customFolders : uniqueFoldersInApp;

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedFolderIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFolderIndex !== index) {
      setDraggedOverFolderIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedFolderIndex(null);
    setDraggedOverFolderIndex(null);
  };

  const handleDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFolderIndex === null || draggedFolderIndex === index) {
      setDraggedOverFolderIndex(null);
      return;
    }
    const reordered = [...allHistoryFolders];
    const [item] = reordered.splice(draggedFolderIndex, 1);
    reordered.splice(index, 0, item);
    saveCustomFoldersInApp(reordered, true);
    setDraggedFolderIndex(null);
    setDraggedOverFolderIndex(null);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete || !user) return;
    const folderName = folderToDelete;

    // 1. Remove from local customFolders
    const updated = customFolders.filter(f => f !== folderName);
    saveCustomFoldersInApp(updated, true);

    // 2. Clear filter if selected
    if (activeFolderFilter === folderName) {
      setActiveFolderFilter(null);
    }

    // 3. Update hauls in firestore to clear folder field
    try {
      const matching = (hauls || []).filter(h => h.folder === folderName);
      if (matching.length > 0) {
        const promises = matching.map(h => 
          updateDoc(doc(db, 'hauls', h.id), { folder: '' })
        );
        await Promise.all(promises);
      }
    } catch (err) {
      console.error('Failed to clear folder field from hauls in firestore:', err);
    }

    setFolderToDelete(null);
  };

  const { updateAvailable, currentVersion } = useVersionMonitor();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const SUPER_ADMIN_EMAIL = atob('ZGF2aWQuYS5idWNrbGV5NzFAZ21haWwuY29t');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        setIsSuperAdmin(u.email === SUPER_ADMIN_EMAIL);
        
        // Load versionCount from user profile, fall back to localStorage
        const userRef = doc(db, 'users', u.uid);
        getDoc(userRef).then(userSnap => {
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (typeof data.versionCount === 'number') {
              setVersionCount(data.versionCount);
              localStorage.setItem(`lod_version_count_${u.uid}`, data.versionCount.toString());
            } else {
              const stored = localStorage.getItem(`lod_version_count_${u.uid}`);
              const localVal = stored ? parseInt(stored, 10) : 0;
              setVersionCount(localVal);
              updateDoc(userRef, { versionCount: localVal }).catch(() => {});
            }
          } else {
            const stored = localStorage.getItem(`lod_version_count_${u.uid}`);
            setVersionCount(stored ? parseInt(stored, 10) : 0);
          }
        }).catch(() => {
          const stored = localStorage.getItem(`lod_version_count_${u.uid}`);
          setVersionCount(stored ? parseInt(stored, 10) : 0);
        });

        const adminRef = doc(db, 'admins', u.uid);
        getDoc(adminRef).then(adminSnap => {
          setIsAdmin(adminSnap.exists() || u.email === SUPER_ADMIN_EMAIL);
        }).catch((err) => {
          setIsAdmin(u.email === SUPER_ADMIN_EMAIL);
        });
      } else {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setVersionCount(0);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setHauls([]);
      prevHaulsSignature.current = '';
      return;
    }

    const q = query(
      collection(db, 'hauls'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          unitNumber: d.unitNumber ?? '',
          unitType: d.unitType ?? '',
          loadNumber: d.loadNumber ?? '',
          customerName: d.customerName ?? '',
          folder: d.folder ?? '',
          notes: d.notes ?? '',
          pickUpDate: d.pickUpDate ?? '',
          pickUpLocation: d.pickUpLocation ?? '',
          deliveryDate: d.deliveryDate ?? '',
          deliveryLocation: d.deliveryLocation ?? '',
          status: d.status ?? 'Active',
          ownerId: d.ownerId ?? '',
          isRecalled: d.isRecalled ?? false,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          totalMiles: Number(d.totalMiles ?? 0),
          ratePerMile: Number(d.ratePerMile ?? 0),
          scaleWeight: Number(d.scaleWeight ?? 0),
          grossWeight: Number(d.grossWeight ?? 0),
          grossRevenue: Number(d.grossRevenue ?? 0),
          totalOperatingCosts: Number(d.totalOperatingCosts ?? 0),
          netProfit: Number(d.netProfit ?? 0),
          milesPerGallon: Number(d.milesPerGallon ?? 0),
          loadedMiles: Number(d.loadedMiles ?? 0),
          deadheadMiles: Number(d.deadheadMiles ?? 0),
          loadedMpg: Number(d.loadedMpg ?? 0),
          deadheadMpg: Number(d.deadheadMpg ?? 0),
        } as Haul;
      });
      setHauls(data);

      const signature = data.map(h => `${h.id}:${(h.updatedAt?.seconds ?? h.updatedAt) || ''}:${h.status}:${h.folder}`).join('|');
      if (prevHaulsSignature.current === '') {
        prevHaulsSignature.current = signature;
      } else if (signature !== prevHaulsSignature.current) {
        prevHaulsSignature.current = signature;
        incrementVersion();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'hauls');
    });
  }, [user]);

  const startNewHaul = async () => {
    if (!user) return;
    const path = 'hauls';
    try {
      const newHaul = {
        unitNumber: '',
        unitType: '',
        loadNumber: '',
        customerName: '',
        folder: '',
        notes: '',
        pickUpDate: new Date().toISOString().split('T')[0],
        milesPerGallon: 0,
        loadedMpg: 0,
        deadheadMpg: 0,
        loadedMiles: 0,
        deadheadMiles: 0,
        pickUpLocation: '',
        deliveryDate: '',
        deliveryLocation: '',
        totalMiles: 0,
        ratePerMile: 0,
        scaleWeight: 0,
        grossWeight: 0,
        grossRevenue: 0,
        totalOperatingCosts: 0,
        netProfit: 0,
        status: 'Active',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, path), newHaul);
      setActiveHaulId(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteHaul = async (haulId: string) => {
    const path = `hauls/${haulId}`;
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'hauls', haulId));
      if (activeHaulId === haulId) {
        setActiveHaulId(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const recallHaul = async (haulId: string) => {
    setActiveHaulId(haulId);
  };

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 font-sans bg-slate-50 text-slate-900 text-center">
        <div className="bg-blue-50 p-6 rounded-full mb-6">
          <Key className="w-12 h-12 text-blue-600" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">Maps Key Required</h2>
        <p className="max-w-md text-slate-500 text-sm mb-8">This application uses Google Maps for intelligent address autocompletion.</p>
        
        <div className="bg-white p-8 rounded-2xl border border-slate-200 max-w-sm w-full text-left shadow-sm">
          <p className="font-semibold text-slate-900 mb-4 text-sm">How to set up:</p>
          <ol className="space-y-3 text-xs text-slate-600 list-decimal list-inside">
            <li>Go to <span className="font-semibold">Settings</span> (gear icon)</li>
            <li>Select <span className="font-semibold">Secrets</span></li>
            <li>Add <code className="bg-slate-100 px-1 rounded">GOOGLE_MAPS_PLATFORM_KEY</code></li>
            <li>Paste your key and save</li>
          </ol>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center font-sans text-slate-400">Loading your dashboard...</div>;

  if (!user) {
    return <Login />;
  }

  const activeWorkspaceHaul = hauls.find(h => h.id === activeHaulId);
  const existingActiveHaul = hauls.find(h => h.status === 'Active');

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="flex flex-col h-screen overflow-hidden">
        {updateAvailable && (
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md z-50 rounded-b-lg m-2 fixed top-0 left-0 right-0 max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm">A new version of LOD Core is available.</span>
            </div>
            <button 
              onClick={async () => {
                const reloadTimeout = new Promise((resolve) => setTimeout(resolve, 300));
                try {
                  await Promise.race([
                    (async () => {
                      if ('caches' in window) {
                         const keys = await caches.keys();
                         await Promise.all(keys.map(k => caches.delete(k)));
                      }
                      if ('serviceWorker' in navigator) {
                         const regs = await navigator.serviceWorker.getRegistrations();
                         for (const reg of regs) {
                           try {
                             await reg.unregister();
                           } catch (e) {
                             console.warn("SW unregister error:", e);
                           }
                         }
                      }
                    })(),
                    reloadTimeout
                  ]);
                } catch (err) {
                  console.error("Clean up on update failed:", err);
                } finally {
                  window.location.reload();
                }
              }} 
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Update Now
            </button>
          </div>
        )}
        <div className="flex flex-1 w-full bg-[#f8fafc] font-sans overflow-hidden text-slate-900 border-t border-transparent relative">
          {/* Mobile Overlay */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-slate-900/50 z-30 md:hidden" 
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {/* Simplified Sidebar */}
        <aside className={`fixed md:sticky top-0 left-0 z-40 h-full w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="p-6 md:p-8 flex items-center justify-between">
            <h1 className="text-blue-600 font-bold text-xl flex items-center gap-2">
              <PickupTrailerIcon className="w-12 h-7 shrink-0 text-blue-600" />
              <span>Transport Genius</span>
            </h1>
            <button 
              className="md:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <nav className="flex-1 px-4 overflow-y-auto">
            <ul className="space-y-1">
              <li 
                onClick={() => { setView('dashboard'); setIsMobileMenuOpen(false); }}
                className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </li>
              <li 
                onClick={() => { setView('history'); setActiveFolderFilter(null); setIsMobileMenuOpen(false); }}
                className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'history' && activeFolderFilter === null ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <History className="w-4 h-4" />
                Unit History
              </li>
              
              {/* Folders expandable/collapsible sub-menu header */}
              <div 
                className="pl-6 pr-4 py-2 flex items-center justify-between text-[11px] font-bold text-slate-450 uppercase tracking-wider cursor-pointer select-none rounded-xl hover:bg-slate-50 transition-all text-slate-500 mt-1"
                onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
              >
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-slate-450" />
                  Folders {allHistoryFolders.length > 0 ? `(${allHistoryFolders.length})` : ''}
                </span>
                {isFoldersExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>

              {isFoldersExpanded && (
                <div className="pl-6 pr-2 py-1 space-y-1 max-h-48 overflow-y-auto">
                  {allHistoryFolders.length > 0 ? (
                    allHistoryFolders.map((folder, index) => {
                      const isSelected = view === 'history' && activeFolderFilter === folder;
                      const isDragged = draggedFolderIndex === index;
                      const isOver = draggedOverFolderIndex === index;
                      return (
                        <div 
                          key={folder}
                          draggable
                          onDragStart={(e) => handleDragStart(index, e)}
                          onDragOver={(e) => handleDragOver(index, e)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(index, e)}
                          onClick={() => {
                            setView('history');
                            setActiveFolderFilter(folder);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`group px-3 py-1.5 cursor-pointer text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all select-none border border-transparent ${
                            isSelected 
                              ? 'bg-blue-50/70 text-blue-700 font-bold' 
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          } ${isDragged ? 'opacity-40 border-dashed border-blue-300' : ''} ${
                            isOver ? 'border-dashed border-blue-400 bg-blue-50/30' : ''
                          }`}
                        >
                          <div 
                            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1.5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering filter click
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                          </div>

                          <Folder className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                            isSelected ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'
                          }`} />
                          
                          <span className="truncate flex-1">{folder}</span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFolderToDelete(folder);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-all flex items-center justify-center shrink-0"
                            title="Delete folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[10px] text-slate-400 italic px-3 py-1">No folders created</p>
                  )}
                </div>
              )}
              <li 
                onClick={() => { setView('settings'); setIsMobileMenuOpen(false); }}
                className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </li>
              {isAdmin && (
                <li 
                  onClick={() => { setView('admin'); setIsMobileMenuOpen(false); }}
                  className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </li>
              )}
            </ul>
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm select-none">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {user.displayName || (user.email?.split('@')[0])}
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Owner/Operator</p>
                </div>
              </div>
              
              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl border border-blue-600 transition-all active:scale-[0.98] shadow-sm mb-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
              )}

              <button 
                onClick={(e) => {
                  e.preventDefault();
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200 transition-all active:scale-[0.98] shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out of System</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-10 flex-shrink-0">
            <div className="flex items-center gap-4 md:gap-6">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg shrink-0"
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="flex flex-col">
                <h2 className="text-slate-900 font-bold text-lg leading-tight capitalize">
                  {view === 'dashboard' ? 'Overview' : view === 'history' ? 'Unit History' : view === 'settings' ? 'Settings' : 'Administration'}
                </h2>
                <p className="hidden md:block text-slate-400 text-xs">Welcome back to your workspace</p>
              </div>
              <div className="hidden md:block h-8 w-[1px] bg-slate-100 mx-2"></div>
              <div className="hidden md:block">
                <WeeklySummary hauls={hauls.filter(h => h.status === 'Completed' || h.status === 'Finalized')} compact timeRange={timeRange} ownerId={user.uid} />
              </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <button 
                onClick={startNewHaul}
                className="bg-blue-600 text-white px-4 md:px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> <span>New Unit</span>
              </button>
              {existingActiveHaul && (
                <button 
                  onClick={() => setActiveHaulId(existingActiveHaul.id)}
                  className="bg-slate-900 text-white px-4 md:px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> 
                  <span className="inline">Open Current Unit</span>
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-10">
            <AnimatePresence mode="wait">
              {view === 'dashboard' ? (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 md:space-y-10"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                    <div className="lg:col-span-8">
                      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 mb-1">Your Performance</h3>
                          <p className="text-slate-500 text-xs">Summary of your stats based on selected time range</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                          <div className="bg-blue-50 border border-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Click any block for quick view
                          </div>
                          <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value as any)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
                          >
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="2m">Last 2 Months</option>
                            <option value="3m">Last 3 Months</option>
                            <option value="1y">Last Year</option>
                            <option value="all">All Time</option>
                          </select>
                        </div>
                      </div>
                      <WeeklySummary hauls={hauls.filter(h => h.status === 'Completed' || h.status === 'Finalized')} timeRange={timeRange} ownerId={user.uid} />
                    </div>
                    
                    <div className="lg:col-span-4">
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-slate-900 mb-1">Status Updates</h3>
                        <p className="text-slate-500 text-xs">Real-time system notifications</p>
                      </div>
                      <div className={`p-6 rounded-3xl border ${hauls.filter(h => h.status === 'Active').length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex gap-4">
                          <div className={`p-2 rounded-xl flex-shrink-0 ${hauls.filter(h => h.status === 'Active').length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {hauls.filter(h => h.status === 'Active').length > 0 ? "Transport in progress" : "No unit currently being tracked"}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {hauls.filter(h => h.status === 'Active').length > 0 
                                ? "You have a unit currently being tracked. Make sure to log expenses to keep data fresh."
                                : "All clear. You can start a new unit when you're ready to hit the road."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : view === 'history' ? (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">Unit History</h3>
                    <p className="text-slate-500 text-sm">Review and manage your past deliveries</p>
                  </div>
                  <HistoricalTable 
                    hauls={hauls.filter(h => h.status === 'Completed' || h.status === 'Finalized' || h.status === 'Active')} 
                    onDelete={deleteHaul}
                    onRecall={recallHaul}
                    ownerId={user.uid}
                    activeFolderFilter={activeFolderFilter}
                    setActiveFolderFilter={setActiveFolderFilter}
                    customFolders={customFolders}
                    setCustomFolders={(folders) => saveCustomFoldersInApp(folders, true)}
                  />
                </motion.div>
              ) : view === 'settings' ? (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <BiometricSettings />
                </motion.div>
              ) : (
                <motion.div
                  key="admin"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AdminPanel 
                    isSuperAdmin={isSuperAdmin} 
                    currentUserUid={user.uid} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence>
          {activeHaulId && activeWorkspaceHaul && (
            <ActiveWorkspace 
              key={activeHaulId}
              haul={activeWorkspaceHaul} 
              onClose={() => setActiveHaulId(null)} 
              customFolders={customFolders}
              onUpdateFolders={(folders) => saveCustomFoldersInApp(folders, true)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {folderToDelete && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-xl"
              onClick={() => setFolderToDelete(null)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full border border-slate-100 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl w-fit mb-5">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Delete Folder</h3>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                  Are you sure you want to delete the folder <span className="font-semibold text-slate-800">"{folderToDelete}"</span>? Delivery records inside this folder will stay, but they won't be assigned to this folder.
                </p>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setFolderToDelete(null)}
                    className="flex-1 py-3 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={confirmDeleteFolder}
                    className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 active:scale-[0.98] transition-all shadow-sm shadow-red-100"
                  >
                    Delete Folder
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {displayVersion && (
          <div className="fixed bottom-2 right-4 text-xs font-medium text-slate-400 z-50 pointer-events-none opacity-70">
            {displayVersion}
          </div>
        )}
      </div>
      </div>
    </APIProvider>
  );
}

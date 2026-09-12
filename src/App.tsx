import React, { useEffect, useState } from 'react';
import { auth, logout, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { Haul } from './types';
import { LogOut, Shield, AlertCircle, Plus, LayoutDashboard, History, ExternalLink, Key, Fingerprint, Download, Menu, X, Folder, Trash2, GripVertical, ChevronDown, ChevronRight, Settings, ChevronUp, MessageSquare } from 'lucide-react';
import PickupTrailerIcon from './components/PickupTrailerIcon';
import { motion, AnimatePresence } from 'motion/react';
import ActiveWorkspace from './components/ActiveWorkspace';
import HistoricalTable from './components/HistoricalTable';
import WeeklySummary from './components/WeeklySummary';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import BiometricSettings from './components/BiometricSettings';
import FeedbackTab from './components/FeedbackTab';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useVersionMonitor } from './hooks/useVersionMonitor';
import { getUpdatesSince, AppUpdate } from './data/updates';
import { RefreshCw, CheckCircle2, Truck } from 'lucide-react';

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
  const [operatorType, setOperatorType] = useState<'RV Tow Away' | 'RV Multi Haul' | 'Hot Shot' | null>(null);
  const [showOperatorPopup, setShowOperatorPopup] = useState<boolean>(false);
  const prevHaulsSignature = React.useRef<string>('');
  const lastActiveTimestampRef = React.useRef<number>(0);

  const reportActivity = React.useCallback(() => {
    if (!user) return;
    const now = Date.now();
    // Throttle Firestore writes to once every 30 seconds to stay within generous quotas
    if (now - lastActiveTimestampRef.current > 30000) {
      lastActiveTimestampRef.current = now;
      const userRef = doc(db, 'users', user.uid);
      updateDoc(userRef, { lastActive: serverTimestamp() }).catch(() => {
        setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
      });
    }
  }, [user]);

  // Track global interactions to record activity in real time
  useEffect(() => {
    if (!user) return;

    // Report initial activity when user logs in or page loads
    reportActivity();

    const handleInteraction = () => {
      reportActivity();
    };

    window.addEventListener('mousedown', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('scroll', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
    };
  }, [user, reportActivity]);

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

  const [view, setView] = useState<'dashboard' | 'history' | 'admin' | 'settings' | 'feedback'>(() => {
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

  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | '3m' | '6m' | '1y' | 'all'>('7d');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [draggedFolderIndex, setDraggedFolderIndex] = useState<number | null>(null);
  const [draggedOverFolderIndex, setDraggedOverFolderIndex] = useState<number | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isFoldersExpanded, setIsFoldersExpanded] = useState<boolean>(true);
  const [isAddingFolderSidebar, setIsAddingFolderSidebar] = useState(false);
  const [newFolderSidebarName, setNewFolderSidebarName] = useState('');

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
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { customFolders: folders }).catch(err => {
          console.warn('Failed to update customFolders in Firestore via updateDoc:', err);
          setDoc(userRef, { customFolders: folders }, { merge: true }).catch(() => {});
        });
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
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    let sourceIndex = draggedFolderIndex;
    if (sourceIndex === null && sourceIndexStr !== '') {
      sourceIndex = parseInt(sourceIndexStr, 10);
    }
    if (sourceIndex === null || sourceIndex === index) {
      setDraggedOverFolderIndex(null);
      return;
    }
    const reordered = [...allHistoryFolders];
    const [item] = reordered.splice(sourceIndex, 1);
    reordered.splice(index, 0, item);
    saveCustomFoldersInApp(reordered, true);
    setDraggedFolderIndex(null);
    setDraggedOverFolderIndex(null);
  };

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    setDraggedFolderIndex(index);
  };

  const handleTouchMove = (index: number, e: React.TouchEvent) => {
    if (draggedFolderIndex === null) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;
    const folderEl = element.closest('[data-folder-index]');
    if (folderEl) {
      const targetIndex = parseInt(folderEl.getAttribute('data-folder-index') || '', 10);
      if (!isNaN(targetIndex) && targetIndex !== draggedFolderIndex) {
        setDraggedOverFolderIndex(targetIndex);
      }
    }
  };

  const handleTouchEnd = () => {
    if (draggedFolderIndex !== null && draggedOverFolderIndex !== null && draggedFolderIndex !== draggedOverFolderIndex) {
      const reordered = [...allHistoryFolders];
      const [item] = reordered.splice(draggedFolderIndex, 1);
      reordered.splice(draggedOverFolderIndex, 0, item);
      saveCustomFoldersInApp(reordered, true);
    }
    setDraggedFolderIndex(null);
    setDraggedOverFolderIndex(null);
  };

  const handleMoveFolder = (index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= allHistoryFolders.length) return;
    const reordered = [...allHistoryFolders];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    saveCustomFoldersInApp(reordered, true);
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

  const { updateAvailable, currentVersion, latestServerVersion, dismissUpdate, markVersionUpdated, justUpdated, acknowledgeJustUpdated, lastSeenVersion } = useVersionMonitor();

  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);

  useEffect(() => {
    // Only show update modal for existing users if there are new updates available
    const lastSeen = localStorage.getItem('last_seen_version');
    if (updateAvailable && lastSeen && lastSeen !== 'development') {
      const pendingUpdates = getUpdatesSince(currentVersion, latestServerVersion || currentVersion || '1.5.77');
      if (pendingUpdates.length > 0) {
        setShowUpdatePopup(true);
        return;
      }
    }
    setShowUpdatePopup(false);
  }, [updateAvailable, currentVersion, latestServerVersion]);

  const triggerAppUpdate = async () => {
    if (isAutoUpdating) return;
    setIsAutoUpdating(true);
    
    const now = Date.now();
    localStorage.setItem('last_lod_auto_update_time', now.toString());
    sessionStorage.setItem('just_manually_updated', 'true');
    
    try {
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
    } catch (err) {
      console.error("Update clean up failed:", err);
    } finally {
      if (latestServerVersion) {
        markVersionUpdated(latestServerVersion);
      }
      window.location.reload();
    }
  };

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

  const SUPER_ADMIN_EMAILS = [
    'support@transportiq.com'
  ];

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        // Check if app was left in background for 30 or more minutes
        const now = Date.now();
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;
        const backgroundEnteredStr = localStorage.getItem('lod_background_entered');
        if (backgroundEnteredStr) {
          const entered = parseInt(backgroundEnteredStr, 10);
          if (entered > 0 && (now - entered) >= THIRTY_MINUTES_MS) {
            localStorage.removeItem('lod_background_entered');
            localStorage.removeItem('lod_last_active_time');
            logout();
            setUser(null);
            setLoading(false);
            return;
          }
        }

        localStorage.removeItem('lod_background_entered');
        localStorage.setItem('lod_last_active_time', now.toString());
        sessionStorage.setItem('lod_session_active', 'true');

        setUser(u);
        setLoading(false);

        const emailLower = (u.email || '').toLowerCase();
        const isSuper = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower);
        setIsSuperAdmin(isSuper);
        
        // Load versionCount, customFolders and operatorType from user profile using real-time onSnapshot
        const userRef = doc(db, 'users', u.uid);
        unsubProfile = onSnapshot(userRef, (userSnap) => {
          if (userSnap.exists()) {
            const data = userSnap.data();

            // Sync customFolders
            if (Array.isArray(data.customFolders)) {
              setCustomFolders(data.customFolders);
              localStorage.setItem(`lod_custom_folders_${u.uid}`, JSON.stringify(data.customFolders));
            } else {
              try {
                const stored = localStorage.getItem(`lod_custom_folders_${u.uid}`);
                if (stored) {
                  const parsed = JSON.parse(stored);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    setCustomFolders(parsed);
                    updateDoc(userRef, { customFolders: parsed }).catch(() => {});
                  }
                }
              } catch (e) {}
            }

            // Sync operatorType
            if (data.operatorType) {
              setOperatorType(data.operatorType);
              setShowOperatorPopup(false);
            } else {
              setOperatorType('RV Tow Away');
              setShowOperatorPopup(true);
            }

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
            // First time registration or no user profile document
            setOperatorType('RV Tow Away');
            setShowOperatorPopup(true);

            const stored = localStorage.getItem(`lod_version_count_${u.uid}`);
            setVersionCount(stored ? parseInt(stored, 10) : 0);

            try {
              const storedFolders = localStorage.getItem(`lod_custom_folders_${u.uid}`);
              setCustomFolders(storedFolders ? JSON.parse(storedFolders) : []);
            } catch {
              setCustomFolders([]);
            }
          }
        }, (error) => {
          console.error("Profile snapshot error:", error);
        });

        const adminRef = doc(db, 'admins', u.uid);
        getDoc(adminRef).then(adminSnap => {
          setIsAdmin(adminSnap.exists() || isSuper);
        }).catch((err) => {
          setIsAdmin(isSuper);
        });
      } else {
        setUser(null);
        setLoading(false);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setVersionCount(0);
        setOperatorType(null);
        setShowOperatorPopup(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // 30-minute background auto-logout and inactivity monitoring
  useEffect(() => {
    if (!user) return;

    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const checkAndTriggerTimeout = () => {
      const now = Date.now();
      const enteredStr = localStorage.getItem('lod_background_entered');
      if (enteredStr) {
        const entered = parseInt(enteredStr, 10);
        if (entered > 0 && (now - entered) >= THIRTY_MINUTES_MS) {
          localStorage.removeItem('lod_background_entered');
          localStorage.removeItem('lod_last_active_time');
          logout();
          setUser(null);
          setLoading(false);
          return true;
        }
      }

      const lastActiveStr = localStorage.getItem('lod_last_active_time');
      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        if (lastActive > 0 && (now - lastActive) >= THIRTY_MINUTES_MS) {
          localStorage.removeItem('lod_background_entered');
          localStorage.removeItem('lod_last_active_time');
          logout();
          setUser(null);
          setLoading(false);
          return true;
        }
      }
      return false;
    };

    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        localStorage.setItem('lod_background_entered', now.toString());
      } else if (document.visibilityState === 'visible') {
        const timedOut = checkAndTriggerTimeout();
        if (!timedOut) {
          localStorage.removeItem('lod_background_entered');
          localStorage.setItem('lod_last_active_time', now.toString());
        }
      }
    };

    const recordUserInteraction = () => {
      localStorage.setItem('lod_last_active_time', Date.now().toString());
    };

    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, recordUserInteraction, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(checkAndTriggerTimeout, 15000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityEvents.forEach(evt => window.removeEventListener(evt, recordUserInteraction));
      clearInterval(interval);
    };
  }, [user]);

  // Touch swipe gesture detection for navigating between views
  const appTouchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  const handleAppTouchStart = (e: React.TouchEvent) => {
    if (activeHaulId) return; // ActiveWorkspace manages its own swipe gestures
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, button, [data-no-swipe], table, .overflow-x-auto')) return;
    appTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  };

  const handleAppTouchEnd = (e: React.TouchEvent) => {
    if (activeHaulId || !appTouchStartRef.current) return;
    const start = appTouchStartRef.current;
    appTouchStartRef.current = null;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - start.x;
    const deltaY = endY - start.y;
    const duration = Date.now() - start.time;

    if (duration > 800) return;
    if (Math.abs(deltaX) > 75 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        // Swiped Left -> Forward
        if (view === 'dashboard') {
          setView('history');
        } else if (view === 'history') {
          setView('settings');
        } else if (view === 'settings') {
          setView('feedback');
        } else if (view === 'feedback' && isAdmin) {
          setView('admin');
        }
      } else {
        // Swiped Right -> Backward
        if (view === 'admin') {
          setView('feedback');
        } else if (view === 'feedback') {
          setView('settings');
        } else if (view === 'settings') {
          setView('history');
        } else if (view === 'history') {
          setView('dashboard');
        }
      }
    }
  };

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
          axles: Number(d.axles ?? 1),
          unitLength: d.unitLength !== undefined && d.unitLength !== null ? Number(d.unitLength) : undefined,
          operatorType: d.operatorType ?? undefined,
          unitNumber2: d.unitNumber2 ?? '',
          unitNumber3: d.unitNumber3 ?? '',
          unitLength2: d.unitLength2 !== undefined && d.unitLength2 !== null ? Number(d.unitLength2) : undefined,
          unitLength3: d.unitLength3 !== undefined && d.unitLength3 !== null ? Number(d.unitLength3) : undefined,
          grossWeight2: d.grossWeight2 !== undefined && d.grossWeight2 !== null ? Number(d.grossWeight2) : undefined,
          grossWeight3: d.grossWeight3 !== undefined && d.grossWeight3 !== null ? Number(d.grossWeight3) : undefined,
          scaleWeight2: d.scaleWeight2 !== undefined && d.scaleWeight2 !== null ? Number(d.scaleWeight2) : undefined,
          scaleWeight3: d.scaleWeight3 !== undefined && d.scaleWeight3 !== null ? Number(d.scaleWeight3) : undefined,
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
        unitLength: 0,
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
        operatorType: operatorType || 'RV Tow Away'
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

  if (isAutoUpdating) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans px-4 text-center">
        <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-2xl max-w-md w-full flex flex-col items-center space-y-6">
          <div className="p-4 bg-blue-500/10 rounded-2xl">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Installing Update</h2>
            <p className="text-sm text-slate-400 leading-relaxed font-normal">
              Transport LogIQ is automatically updating to the newest version to keep your operational data perfectly in sync. This will take just a second.
            </p>
          </div>
          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-2/3 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const activeWorkspaceHaul = hauls.find(h => h.id === activeHaulId);
  const existingActiveHaul = hauls.find(h => h.status === 'Active');

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="flex flex-col h-screen overflow-hidden">
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
              <span>Transport LogIQ</span>
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
                {operatorType === 'Hot Shot' ? 'Load History' : 'Unit History'}
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
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFoldersExpanded(true);
                      setIsAddingFolderSidebar(true);
                    }}
                    className="p-1 text-slate-450 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                    title="Add new folder"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {isFoldersExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" onClick={() => setIsFoldersExpanded(false)} />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" onClick={() => setIsFoldersExpanded(true)} />
                  )}
                </div>
              </div>

              {isFoldersExpanded && (
                <div className="pl-6 pr-2 py-1 space-y-1 max-h-48 overflow-y-auto">
                  {isAddingFolderSidebar && (
                    <div className="px-2 py-1.5 bg-slate-50 border border-blue-100 rounded-lg flex items-center gap-1.5 mb-2">
                      <input
                        type="text"
                        autoFocus
                        value={newFolderSidebarName}
                        onChange={(e) => setNewFolderSidebarName(e.target.value)}
                        placeholder="New folder..."
                        className="w-full bg-transparent text-[11px] font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = newFolderSidebarName.trim();
                            if (trimmed) {
                              if (!allHistoryFolders.includes(trimmed)) {
                                saveCustomFoldersInApp([...allHistoryFolders, trimmed], true);
                              }
                              setNewFolderSidebarName('');
                              setIsAddingFolderSidebar(false);
                            }
                          } else if (e.key === 'Escape') {
                            setNewFolderSidebarName('');
                            setIsAddingFolderSidebar(false);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newFolderSidebarName.trim();
                          if (trimmed) {
                            if (!allHistoryFolders.includes(trimmed)) {
                              saveCustomFoldersInApp([...allHistoryFolders, trimmed], true);
                            }
                            setNewFolderSidebarName('');
                            setIsAddingFolderSidebar(false);
                          }
                        }}
                        className="p-0.5 hover:bg-blue-100 text-blue-600 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewFolderSidebarName('');
                          setIsAddingFolderSidebar(false);
                        }}
                        className="p-0.5 hover:bg-slate-200 text-slate-400 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {allHistoryFolders.length > 0 ? (
                    allHistoryFolders.map((folder, index) => {
                      const isSelected = view === 'history' && activeFolderFilter === folder;
                      const isDragged = draggedFolderIndex === index;
                      const isOver = draggedOverFolderIndex === index;
                      return (
                        <motion.div 
                          layout
                          key={folder}
                          data-folder-index={index}
                          draggable
                          onDragStart={(e) => handleDragStart(index, e)}
                          onDragOver={(e) => handleDragOver(index, e)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(index, e)}
                          onTouchStart={(e) => handleTouchStart(index, e)}
                          onTouchMove={(e) => handleTouchMove(index, e)}
                          onTouchEnd={handleTouchEnd}
                          onClick={() => {
                            setView('history');
                            setActiveFolderFilter(folder);
                            setIsMobileMenuOpen(false);
                          }}
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          className={`group relative px-3 py-1.5 cursor-pointer text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all select-none border ${
                            isSelected 
                              ? 'bg-blue-50/70 text-blue-700 font-bold border-blue-100' 
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
                          } ${isDragged ? 'opacity-30 bg-slate-100/50 scale-95 border-dashed border-slate-300' : ''} ${
                            isOver ? 'scale-[1.02] bg-blue-50/80 shadow-sm border-blue-400 text-blue-900 border-dashed z-10' : ''
                          }`}
                        >
                          {/* Drag Insertion Guide Line */}
                          {isOver && draggedFolderIndex !== null && (
                            <div 
                              className={`absolute left-0 right-0 h-0.5 bg-blue-500 rounded-full z-20 ${
                                index > draggedFolderIndex ? '-bottom-1' : '-top-1'
                              }`}
                              style={{ boxShadow: '0 0 8px #3b82f6' }}
                            />
                          )}
                          <div 
                            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1.5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors touch-none"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering filter click
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                          </div>

                          <Folder className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                            isSelected ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'
                          }`} />
                          
                          <span className="truncate flex-1">{folder}</span>

                          {/* Up/Down buttons for mobile & failsafe cross-platform reordering */}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 gap-0.5">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveFolder(index, -1);
                              }}
                              className="p-0.5 hover:bg-slate-100 disabled:opacity-25 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              title="Move up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === allHistoryFolders.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveFolder(index, 1);
                              }}
                              className="p-0.5 hover:bg-slate-100 disabled:opacity-25 text-slate-400 hover:text-slate-600 rounded transition-colors"
                              title="Move down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

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
                        </motion.div>
                      );
                    })
                  ) : (
                    <p className="text-[10px] text-slate-400 italic px-3 py-1">No folders created</p>
                  )}
                </div>
              )}
              <li 
                id="sidebar-nav-settings"
                onClick={() => { setView('settings'); setIsMobileMenuOpen(false); }}
                className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </li>
              <li 
                id="sidebar-nav-feedback"
                onClick={() => { setView('feedback'); setIsMobileMenuOpen(false); }}
                className={`px-4 py-3 cursor-pointer text-sm font-medium rounded-xl flex items-center gap-3 transition-colors ${view === 'feedback' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <MessageSquare className="w-4 h-4" />
                Feedback
              </li>
              {isAdmin && (
                <li 
                  id="sidebar-nav-admin"
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
        <main 
          className="flex-1 flex flex-col min-w-0"
          onTouchStart={handleAppTouchStart}
          onTouchEnd={handleAppTouchEnd}
        >
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
                  {view === 'dashboard' ? 'Overview' : view === 'history' ? (operatorType === 'Hot Shot' ? 'Load History' : 'Unit History') : view === 'settings' ? 'Settings' : view === 'feedback' ? 'Feedback' : 'Administration'}
                </h2>
                <p className="hidden md:block text-slate-400 text-xs">
                  {view === 'feedback' ? 'Help us improve Transport LogIQ' : 'Welcome back to your workspace'}
                </p>
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
                <Plus className="w-4 h-4" /> <span>{operatorType === 'Hot Shot' ? 'New Load' : 'New Unit'}</span>
              </button>
              {existingActiveHaul && (
                <button 
                  onClick={() => setActiveHaulId(existingActiveHaul.id)}
                  className="bg-slate-900 text-white px-4 md:px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> 
                  <span className="inline">{operatorType === 'Hot Shot' ? 'Open Current Load' : 'Open Current Unit'}</span>
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
                            <option value="14d">Last 14 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="3m">Last 3 Months</option>
                            <option value="6m">Last 6 Months</option>
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
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">{operatorType === 'Hot Shot' ? 'Load History' : 'Unit History'}</h3>
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
              ) : view === 'feedback' ? (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <FeedbackTab currentUser={user} />
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

        {(() => {
          const relevantHaulsList = view === 'history'
            ? (hauls.filter(h => (h.status === 'Completed' || h.status === 'Finalized') && (!activeFolderFilter || h.folder === activeFolderFilter)) || [])
            : (hauls.filter(h => h.status === 'Active') || []);
          const currentWorkspaceIndex = relevantHaulsList.findIndex(h => h.id === activeHaulId);
          const handleWorkspacePrev = currentWorkspaceIndex > 0 ? () => {
            setActiveHaulId(relevantHaulsList[currentWorkspaceIndex - 1].id);
          } : undefined;
          const handleWorkspaceNext = currentWorkspaceIndex >= 0 && currentWorkspaceIndex < relevantHaulsList.length - 1 ? () => {
            setActiveHaulId(relevantHaulsList[currentWorkspaceIndex + 1].id);
          } : undefined;

          return (
            <AnimatePresence>
              {activeHaulId && activeWorkspaceHaul && (
                <ActiveWorkspace 
                  key={activeHaulId}
                  haul={activeWorkspaceHaul} 
                  onClose={() => setActiveHaulId(null)} 
                  customFolders={customFolders}
                  onUpdateFolders={(folders) => saveCustomFoldersInApp(folders, true)}
                  operatorType={operatorType}
                  onNavigatePrev={handleWorkspacePrev}
                  onNavigateNext={handleWorkspaceNext}
                />
              )}
            </AnimatePresence>
          );
        })()}

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
        
        <AnimatePresence>
          {showUpdatePopup && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[10000] flex items-center justify-center p-4"
              onClick={dismissUpdate}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <RefreshCw className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Software Update Available</h3>
                      <p className="text-xs font-semibold text-blue-600 mt-0.5">Version {latestServerVersion || 'v1.5.56'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={dismissUpdate}
                    className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    A new update is ready for Transport LogIQ! Here is what's new since your current build:
                  </p>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/60 max-h-[220px] overflow-y-auto space-y-3 scrollbar-thin">
                    {getUpdatesSince(currentVersion, latestServerVersion || currentVersion || '1.5.77').map((update: AppUpdate, idx: number) => (
                      <div key={idx} className="flex gap-2.5 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-800">{update.title}</p>
                            <span className="px-1.5 py-0.5 bg-slate-200/80 text-[9px] font-bold text-slate-500 rounded-md">v{update.version}</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{update.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={dismissUpdate}
                    disabled={isAutoUpdating}
                    className="flex-1 py-3 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    Later
                  </button>
                  <button 
                    type="button"
                    onClick={triggerAppUpdate}
                    disabled={isAutoUpdating}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-all shadow-sm shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isAutoUpdating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update & Restart'
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {justUpdated && !showUpdatePopup && getUpdatesSince(lastSeenVersion, currentVersion || '1.5.77').length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[10000] flex items-center justify-center p-4"
              onClick={acknowledgeJustUpdated}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                      <CheckCircle2 className="w-6 h-6 animate-bounce" style={{ animationDuration: '2s' }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Software Successfully Updated!</h3>
                      <p className="text-xs font-semibold text-emerald-600 mt-0.5">Version {currentVersion || 'v1.5.56'} is now active</p>
                    </div>
                  </div>
                  <button 
                    onClick={acknowledgeJustUpdated}
                    className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Transport LogIQ has been updated! Here is the list of new features and improvements available in this build:
                  </p>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/60 max-h-[280px] overflow-y-auto space-y-3 scrollbar-thin">
                    {getUpdatesSince(lastSeenVersion, currentVersion || '1.5.77').map((update: AppUpdate, idx: number) => (
                      <div key={idx} className="flex gap-2.5 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-800">{update.title}</p>
                            <span className="px-1.5 py-0.5 bg-slate-200/80 text-[9px] font-bold text-slate-500 rounded-md">v{update.version}</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{update.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={acknowledgeJustUpdated}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-all shadow-sm shadow-blue-100 flex items-center justify-center gap-2"
                  >
                    Awesome, Let's Go!
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FIRST-TIME REGISTRATION OPERATOR SELECTION POPUP */}
        <AnimatePresence>
          {showOperatorPopup && user && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 shadow-xl animate-none"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-100 shadow-2xl flex flex-col"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Welcome to Transport LogIQ</h3>
                    <p className="text-xs text-slate-400">Please select your primary workspace classification</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  To calibrate your performance metrics, target MPGs, and coordinate the entry fields of your dispatch trips, tell us how you operate:
                </p>

                <div className="space-y-3.5 mb-2">
                  {/* Option 1: RV Tow Away */}
                  <button
                    type="button"
                    onClick={() => {
                      const userRef = doc(db, 'users', user.uid);
                      setDoc(userRef, { operatorType: 'RV Tow Away' }, { merge: true }).catch(() => {});
                      setOperatorType('RV Tow Away');
                      setShowOperatorPopup(false);
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-slate-50/80 transition-all flex items-start gap-3.5 group"
                  >
                    <span className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center text-xs shrink-0 mt-0.5 group-hover:border-blue-500 group-hover:bg-blue-50">
                      <span className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-blue-500" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-800">RV Tow Away Operator</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Optimized for single RV towing setups (travel trailers or fifth wheels). Standard logistics form tracking.</p>
                    </div>
                  </button>

                  {/* Option 2: RV Multi Haul */}
                  <button
                    type="button"
                    onClick={() => {
                      const userRef = doc(db, 'users', user.uid);
                      setDoc(userRef, { operatorType: 'RV Multi Haul' }, { merge: true }).catch(() => {});
                      setOperatorType('RV Multi Haul');
                      setShowOperatorPopup(false);
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-slate-50/80 transition-all flex items-start gap-3.5 group"
                  >
                    <span className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center text-xs shrink-0 mt-0.5 group-hover:border-blue-500 group-hover:bg-blue-50">
                      <span className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-blue-500" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-800">RV Multi Haul Operator</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Optimized for multi-unit transport. Adds split inputs for up to 3 Unit Numbers, Lengths, GVWRs, and Dry Weights simultaneously.</p>
                    </div>
                  </button>

                  {/* Option 3: Hot Shot */}
                  <button
                    type="button"
                    onClick={() => {
                      const userRef = doc(db, 'users', user.uid);
                      setDoc(userRef, { operatorType: 'Hot Shot' }, { merge: true }).catch(() => {});
                      setOperatorType('Hot Shot');
                      setShowOperatorPopup(false);
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-slate-50/80 transition-all flex items-start gap-3.5 group"
                  >
                    <span className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center text-xs shrink-0 mt-0.5 group-hover:border-blue-500 group-hover:bg-blue-50">
                      <span className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-blue-500" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-800">Hot Shot Operator</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Optimized for LTL freight/flatbed. Replaces "Unit Number" with "BOL Number", "GVWR" with "Load Weight", and streamlines dry weight requirements.</p>
                    </div>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {currentVersion && (
          <div className="fixed bottom-2 right-4 text-[10px] font-bold text-slate-400 z-50 pointer-events-none opacity-60">
            {currentVersion}
          </div>
        )}
      </div>
      </div>
    </APIProvider>
  );
}

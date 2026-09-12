import { useEffect, useState, useRef } from 'react';
import { getUpdatesSince } from '../data/updates';

export function useVersionMonitor() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestServerVersion, setLatestServerVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(null);
  
  const clientVersion = (import.meta as any).env?.VITE_APP_VERSION || 'development';

  useEffect(() => {
    if (clientVersion !== 'development') {
      const lastSeen = localStorage.getItem('last_seen_version');
      setLastSeenVersion(lastSeen);
      const cleanClient = clientVersion.trim().replace(/^v/, '');
      const wasManuallyUpdated = sessionStorage.getItem('just_manually_updated') === 'true';
      
      if (wasManuallyUpdated) {
        sessionStorage.removeItem('just_manually_updated');
        localStorage.setItem('last_seen_version', clientVersion);
        setJustUpdated(false);
        return;
      }

      if (!lastSeen) {
        // First-time user / new account setup: do not display an update notification
        setJustUpdated(false);
        localStorage.setItem('last_seen_version', clientVersion);
      } else {
        const cleanLastSeen = lastSeen.trim().replace(/^v/, '');
        if (cleanLastSeen !== cleanClient) {
          // Existing user who opened an earlier version: only notify if there are updates since lastSeen
          const updates = getUpdatesSince(lastSeen, clientVersion);
          if (updates.length > 0) {
            setJustUpdated(true);
          } else {
            setJustUpdated(false);
            localStorage.setItem('last_seen_version', clientVersion);
          }
        }
      }
    }
  }, [clientVersion]);

  const acknowledgeJustUpdated = () => {
    setJustUpdated(false);
    localStorage.setItem('last_seen_version', clientVersion);
  };

  useEffect(() => {
    const formatted = clientVersion.startsWith('v') ? clientVersion : `v${clientVersion}`;
    setCurrentVersion(formatted);

    const checkVersion = async () => {
      const now = Date.now();
      
      try {
        const res = await fetch(`/api/version?t=${now}`, { cache: 'no-store' });
        if (!res.ok) {
          console.warn("Version check endpoint health issues:", res.status);
          return;
        }
        
        const data = await res.json();
        const serverVersion = data.version;

        if (serverVersion) {
          localStorage.setItem('last_version_check_time', now.toString());
          localStorage.setItem('cached_latest_version', serverVersion);
          setLatestServerVersion(serverVersion);

          const dismissed = sessionStorage.getItem('dismissed_version');
          const lastUpdated = sessionStorage.getItem('last_updated_version');

          const cleanServer = serverVersion.trim().replace(/^v/, '');
          const cleanClient = clientVersion.trim().replace(/^v/, '');
          const cleanDismissed = dismissed ? dismissed.trim().replace(/^v/, '') : null;
          const cleanLastUpdated = lastUpdated ? lastUpdated.trim().replace(/^v/, '') : null;

          if (
            serverVersion !== 'development' &&
            cleanDismissed !== cleanServer &&
            dismissed !== 'all' &&
            cleanLastUpdated !== cleanServer &&
            lastUpdated !== 'all' &&
            cleanServer !== cleanClient
          ) {
            setUpdateAvailable(true);
            setJustUpdated(false);
          } else {
            setUpdateAvailable(false);
          }
        }
      } catch (err) {
        console.warn("Version check failed:", err);
      }
    };

    // Check version immediately on mount
    checkVersion();

    // Check periodically every 30 seconds for background updates
    const interval = setInterval(checkVersion, 30000);

    return () => clearInterval(interval);
  }, [clientVersion]);

  const forceCheck = async () => {
    setChecking(true);
    try {
      const now = Date.now();
      const res = await fetch(`/api/version?t=${now}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const serverVersion = data.version;
        if (serverVersion) {
          localStorage.setItem('last_version_check_time', now.toString());
          localStorage.setItem('cached_latest_version', serverVersion);
          setLatestServerVersion(serverVersion);

          const cleanServer = serverVersion.trim().replace(/^v/, '');
          const cleanClient = clientVersion.trim().replace(/^v/, '');
          
          if (serverVersion !== 'development' && cleanServer !== cleanClient) {
            setUpdateAvailable(true);
            setJustUpdated(false);
            return { updated: true, version: serverVersion };
          }
        }
      }
    } catch (e) {
      console.warn("Manual check failed:", e);
    } finally {
      setChecking(false);
    }
    return { updated: false, version: latestServerVersion || clientVersion };
  };

  const dismissUpdate = () => {
    setUpdateAvailable(false);
    if (latestServerVersion) {
      sessionStorage.setItem('dismissed_version', latestServerVersion);
    } else {
      sessionStorage.setItem('dismissed_version', 'all');
    }
  };

  const markVersionUpdated = (version: string) => {
    const v = (version && version !== 'all') ? version : (latestServerVersion || 'all');
    sessionStorage.setItem('last_updated_version', v);
    setUpdateAvailable(false);
  };

  return { updateAvailable, currentVersion, latestServerVersion, dismissUpdate, markVersionUpdated, forceCheck, checking, justUpdated, acknowledgeJustUpdated, lastSeenVersion };
}

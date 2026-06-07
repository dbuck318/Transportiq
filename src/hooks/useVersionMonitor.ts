import { useEffect, useState } from 'react';

export function useVersionMonitor() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  
  const clientVersion = (import.meta as any).env?.VITE_APP_VERSION || 'development';

  useEffect(() => {
    setCurrentVersion(clientVersion);

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        
        const data = await res.json();
        const serverVersion = data.version;
        
        if (serverVersion && serverVersion !== clientVersion) {
          // Client version is different from server version!
          setUpdateAvailable(true);
        }
      } catch (err) {
        // Silently ignore network errors (e.g. offline)
      }
    };

    // Check version immediately
    checkVersion();
    
    // Then check every 3 seconds for snappy and fast updates
    const intervalId = setInterval(checkVersion, 3000);
    
    // And also check when the window becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clientVersion]);

  return { updateAvailable, currentVersion };
}

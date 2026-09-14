import React, { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, LogOut, Lock, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from 'firebase/auth';

interface BiometricUnlockProps {
  user: User;
  onUnlock: () => void;
  onSignOut: () => Promise<void>;
}

export default function BiometricUnlock({ user, onUnlock, onSignOut }: BiometricUnlockProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const triggerUnlock = async () => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const email = user.email;
      if (!email) {
        throw new Error('No user email associated with this session');
      }

      // 1. Generate options
      const optionsRes = await fetch('/api/auth/generate-authentication-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!optionsRes.ok) {
        let errMsg = 'Biometrics are not set up or enabled for this account on this device';
        try {
          const errData = await optionsRes.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          const text = await optionsRes.text();
          if (text) errMsg = text;
        }
        throw new Error(errMsg);
      }

      const { options, userId } = await optionsRes.json();
      if (!options) {
        throw new Error('No registered biometric key was found for this account');
      }

      // 2. Browser biometric challenge prompt
      const asseResp = await startAuthentication({ optionsJSON: options });

      // 3. Verify on server
      const verifyRes = await fetch('/api/auth/verify-authentication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: asseResp, userId }),
      });

      if (!verifyRes.ok) {
        let errMsg = 'Verification failed';
        try {
          const errData = await verifyRes.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          const text = await verifyRes.text();
          if (text) errMsg = text;
        }
        throw new Error(errMsg);
      }

      const verifyData = await verifyRes.json();
      if (verifyData.verified) {
        sessionStorage.setItem('lod_session_active', 'true');
        sessionStorage.setItem('lod_session_start', Date.now().toString());
        localStorage.setItem('lod_last_active_time', Date.now().toString());
        localStorage.removeItem('lod_background_entered');
        onUnlock();
      } else {
        throw new Error('Biometric validation failed');
      }
    } catch (err: any) {
      console.warn("Biometric unlock error:", err);
      const isCancellation = 
        err.message?.includes('canceled') || 
        err.message?.includes('cancelled') ||
        err.name === 'NotAllowedError';
      setError(isCancellation ? 'Verification cancelled' : (err.message || 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger biometric challenge on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      triggerUnlock();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 md:p-10 max-w-md w-full border border-slate-100 shadow-2xl text-center flex flex-col items-center"
      >
        <div className="p-4 bg-blue-50 text-blue-600 rounded-full mb-6 relative">
          <Lock className="w-5 h-5 absolute -top-1 -right-1 bg-white p-1 rounded-full text-slate-500 border border-slate-100 shadow-xs" />
          <Fingerprint className="w-12 h-12" />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Session Locked</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">
          Your Transport LogIQ session is secured. Please verify your biometrics to continue as:
        </p>
        <p className="font-semibold text-blue-600 text-sm mt-1 mb-8 break-all px-4 py-1.5 bg-blue-50/50 rounded-lg">
          {user.email}
        </p>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-xs px-4 py-3 rounded-xl mb-6 w-full text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        )}

        <button
          onClick={triggerUnlock}
          disabled={loading}
          className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-all shadow-sm shadow-blue-100 flex items-center justify-center gap-2.5 mb-4 disabled:opacity-75"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Scanning Biometrics...
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4" />
              Verify Biometrics
            </>
          )}
        </button>

        <button
          onClick={onSignOut}
          disabled={loading}
          className="w-full py-3.5 px-6 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
        >
          <LogOut className="w-4 h-4" />
          Use Password / Switch Account
        </button>
      </motion.div>
    </div>
  );
}

import { useState, FormEvent, MouseEvent } from 'react';
import { auth, db, googleProvider } from '../lib/firebase';
import { 
  signInWithPopup,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  setPersistence,
  signInWithCustomToken,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Fingerprint, Lock } from 'lucide-react';
import PickupTrailerIcon from './PickupTrailerIcon';
import { startAuthentication } from '@simplewebauthn/browser';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const syncUserProfile = async (user: any) => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || 'Operator',
        photoURL: user.photoURL || '',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
    } else {
      await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
    }
  };

  const onIdentityTrigger = async () => {
    setLoading(true);
    setError('');
    try {
      await setPersistence(auth, staySignedIn ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    if (!email) {
      setError('Please enter your email to use biometric sign-in');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const optionsRes = await fetch('/api/auth/generate-authentication-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const { options, userId } = await optionsRes.json();
      if (!options) throw new Error('Biometrics not set up for this account');

      const asseResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/verify-authentication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: asseResp, userId }),
      });

      const { verified, customToken } = await verifyRes.json();

      if (verified && customToken) {
        await setPersistence(auth, staySignedIn ? browserLocalPersistence : browserSessionPersistence);
        const result = await signInWithCustomToken(auth, customToken);
        await syncUserProfile(result.user);
      } else {
        throw new Error('Biometric verification failed');
      }
    } catch (err: any) {
      setError(err.message === 'The user canceled the operation.' ? 'Biometric login cancelled' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await setPersistence(auth, staySignedIn ? browserLocalPersistence : browserSessionPersistence);
        const result = await signInWithEmailAndPassword(auth, email, password);
        await syncUserProfile(result.user);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        await sendEmailVerification(result.user);
        await syncUserProfile(result.user);
        setVerificationSent(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[400px]"
      >
        <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-sm">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-600 rounded-2xl flex items-center justify-center">
              <PickupTrailerIcon className="w-16 h-10 text-white shrink-0" />
            </div>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
              {verificationSent ? 'Check your inbox' : (isLogin ? 'Welcome back' : 'Create an account')}
            </h1>
            <div className="text-slate-500 text-sm select-none pointer-events-none">
              {verificationSent 
                ? `A verification link has been dispatched to your registered address.` 
                : (isLogin ? 'Sign in to access your fleet dashboard' : 'Join the logistics network to start tracking')}
            </div>
          </div>

          {verificationSent ? (
            <button
              onClick={() => {
                setVerificationSent(false);
                setIsLogin(true);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-sm transition-all text-sm mb-4"
            >
              Back to Sign In
            </button>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <input
                  required
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            )}

            <div>
              <input
                required
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <input
                required
                type="password"
                value={password}
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={(e) => setStaySignedIn(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 border-2 border-slate-200 rounded-md bg-white peer-checked:bg-blue-600 peer-checked:border-transparent transition-all group-hover:border-blue-300"></div>
                  <svg className="absolute w-3 h-3 text-white scale-0 peer-checked:scale-100 transition-transform left-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Stay signed in</span>
              </label>
              
              {isLogin && (
                <button
                  type="button"
                  onClick={handleBiometricSignIn}
                  className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-tight transition-colors"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  Biometric Login
                </button>
              )}
            </div>

            {error && (
              <p className="text-red-500 text-xs font-medium text-center bg-red-50 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 group disabled:opacity-50 mt-2"
            >
              {loading ? 'Processing...' : (
                <>
                  {isLogin ? 'Sign in' : 'Create account'}
                </>
              )}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-xs text-slate-400">
              <span className="px-3 bg-white">or</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              id="google-login-identity-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget) e.currentTarget.blur();
                onIdentityTrigger();
              }}
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-black text-white font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl active:scale-[0.98]"
            >
              <span className="text-sm">Sign in with Google</span>
            </button>
          </div>
        </>
      )}

      {!verificationSent && (
        <div className="mt-10 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 font-semibold text-sm hover:text-blue-700 underline-offset-4"
          >
            {isLogin ? "Don't have an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      )}
    </div>

    <div className="mt-8 text-center text-xs text-slate-400">
      <span>Fleet Management Platform // Authenticated Access</span>
    </div>
  </motion.div>
</div>
  );
}

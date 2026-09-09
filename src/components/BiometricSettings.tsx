import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { startRegistration } from '@simplewebauthn/browser';
import { 
  Fingerprint, 
  ShieldCheck, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Truck, 
  Fuel, 
  Settings, 
  Calendar, 
  Scale,
  Wrench, 
  Check, 
  Activity,
  ChevronRight,
  Trash2,
  UserX,
  RefreshCw,
  Cpu,
  Compass,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function BiometricSettings() {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'account'>('profile');

  // Deactivation state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSecondConfirmModal, setShowSecondConfirmModal] = useState(false);
  const [deactivateSuccess, setDeactivateSuccess] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [verificationText, setVerificationText] = useState('');

  const handleDeactivateAndSignOut = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setDeactivating(true);
    try {
      // Mark the user profile as deactivated, strip basic identifiers 
      // but preserve technical configs & scales so aggregate MPG & profiles indexing is unaffected
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        deactivated: true,
        status: 'deactivated',
        deactivatedAt: new Date().toISOString(),
        email: null,
        vin: null
      }, { merge: true });

      setDeactivateSuccess(true);
      setShowSecondConfirmModal(false);
      setShowConfirmModal(false);
    } catch (err) {
      console.error("Account deactivation error:", err);
      alert("An error occurred during deactivation: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeactivating(false);
    }
  };

  // Profile fields state
  const [profile, setProfile] = useState({
    fuelType: 'Diesel',
    powerUnitYear: '',
    powerUnitMake: '',
    powerUnitModel: '',
    engineType: '',
    duallyOrSrw: 'DRW',
    drivetrain: "4x4",
    powerUnitScaleWeight: "",
    powerUnitWheelbase: 'LWB' as 'LWB' | 'SWB',
    otherVehicleNotes: '',
    vin: '',
    // New fields
    operatorType: 'RV Tow Away' as 'RV Tow Away' | 'RV Multi Haul' | 'Hot Shot',
    tireMake: '',
    tireType: '',
    tireSize: '',
    trailerMake: '',
    trailerModel: '',
    trailerLength: '',
    trailerWeight: ''
  });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // VIN verification states
  const [decodingVin, setDecodingVin] = useState(false);
  const [vinError, setVinError] = useState('');
  const [vinSuccess, setVinSuccess] = useState('');

  // Biometrics state
  const [loadingBio, setLoadingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState(false);

  // Common options for dropdown select lists
  const COMMON_MAKES = ['RAM', 'Ford', 'Chevrolet', 'GMC', 'Toyota', 'Nissan', 'Freightliner', 'International', 'Custom'];
  const COMMON_ENGINES = [
    '6.7L Cummins Diesel',
    '6.7L PowerStroke Diesel',
    '6.6L Duramax Diesel',
    '6.4L Hemi Gas V8',
    '7.3L Godzilla Gas V8',
    '6.6L Gas V8',
    '8.1L Vortec Gas V8',
    '6.0L PowerStroke Diesel',
    'Custom'
  ];

  const GET_MAKE_MODELS = (make: string) => {
    const upper = (make || '').toUpperCase();
    if (upper.includes('RAM') || upper.includes('DODGE')) {
      return ['2500', '3500 HD', '4500', '5500', 'Custom'];
    }
    if (upper.includes('FORD')) {
      return ['F-250', 'F-350', 'F-450', 'F-550', 'F-650', 'Custom'];
    }
    if (upper.includes('CHEVROLET') || upper.includes('CHEVY')) {
      return ['Silverado 1500', 'Silverado 2500 HD', 'Silverado 3500 HD', 'Custom'];
    }
    if (upper.includes('GMC')) {
      return ['Sierra 1500', 'Sierra 2500 HD', 'Sierra 3500 HD', 'Custom'];
    }
    return ['Custom'];
  };

  const GET_ENGINES_FOR_VEHICLE = (make: string, model: string): string[] => {
    const makeUpper = (make || '').toUpperCase();
    const modelUpper = (model || '').toUpperCase();

    // RAM / Dodge
    if (makeUpper.includes('RAM') || makeUpper.includes('DODGE')) {
      return [
        '6.7L Cummins Diesel',
        '6.4L Hemi Gas V8',
        '5.9L Cummins Diesel',
        'Custom'
      ];
    }

    // Ford
    if (makeUpper.includes('FORD')) {
      if (modelUpper === 'F-650') {
        return [
          '6.7L PowerStroke Diesel',
          '7.3L Godzilla Gas V8',
          'Custom'
        ];
      }
      return [
        '6.7L PowerStroke Diesel',
        '7.3L Godzilla Gas V8',
        '6.0L PowerStroke Diesel',
        'Custom'
      ];
    }

    // Chevy / GMC / GM
    if (
      makeUpper.includes('CHEVROLET') || 
      makeUpper.includes('CHEVY') || 
      makeUpper.includes('GMC')
    ) {
      if (modelUpper.includes('1500')) {
        return [
          '3.0L Duramax Diesel',
          '6.2L Gas V8',
          '5.3L Gas V8',
          'Custom'
        ];
      }
      return [
        '6.6L Duramax Diesel',
        '6.6L Gas V8',
        '8.1L Vortec Gas V8',
        'Custom'
      ];
    }

    // Toyota
    if (makeUpper.includes('TOYOTA')) {
      return [
        '5.7L Gas V8',
        '3.4L Twin-Turbo V6 Hybrid',
        'Custom'
      ];
    }

    // Nissan
    if (makeUpper.includes('NISSAN')) {
      return [
        '5.0L Cummins Diesel V8',
        '5.6L Gas V8',
        'Custom'
      ];
    }

    // Freightliner
    if (makeUpper.includes('FREIGHTLINER')) {
      return [
        'Detroit DD13 Diesel',
        'Detroit DD15 Diesel',
        'Cummins L9 Diesel',
        'Cummins X15 Diesel',
        'Custom'
      ];
    }

    // International
    if (makeUpper.includes('INTERNATIONAL')) {
      return [
        'International A26 Diesel',
        'Cummins X15 Diesel',
        'Cummins B6.7 Diesel',
        'Cummins L9 Diesel',
        'Custom'
      ];
    }

    // Universal / default common engines - fallback
    return [
      '6.7L Cummins Diesel',
      '6.7L PowerStroke Diesel',
      '6.6L Duramax Diesel',
      '6.4L Hemi Gas V8',
      '7.3L Godzilla Gas V8',
      '6.6L Gas V8',
      '8.1L Vortec Gas V8',
      '6.0L PowerStroke Diesel',
      'Custom'
    ];
  };

  // Safe VIN Decoder
  const handleDecodeVin = async (vinToDecode: string) => {
    const cleanVin = (vinToDecode || '').trim().toUpperCase();
    if (!cleanVin) return;
    if (cleanVin.length !== 17) {
      setVinError("VIN must be exactly 17 characters in length.");
      setTimeout(() => setVinError(''), 4000);
      return;
    }

    setDecodingVin(true);
    setVinError('');
    setVinSuccess('');

    try {
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${cleanVin}?format=json`);
      if (!response.ok) throw new Error("Could not connect to the federal VIN database.");
      
      const data = await response.json();
      if (!data.Results || data.Results.length === 0) {
        throw new Error("No vehicle metadata retrieved for this VIN.");
      }

      const results = data.Results;
      const getVal = (variableName: string) => {
        const found = results.find((r: any) => r.Variable === variableName);
        return found ? found.Value : '';
      };

      const makeVal = getVal("Make");
      const modelVal = getVal("Model");
      const yearVal = getVal("Model Year");
      const displacementVal = getVal("Displacement (L)");
      const driveTypeVal = getVal("Drive Type");
      const fuelTypePrimary = getVal("Fuel Type - Primary");

      if (!makeVal) {
        throw new Error("Unsupported or unrecognized VIN. Please enter truck specs manually.");
      }

      // Compose engine string
      let engineText = '';
      if (displacementVal) {
        engineText += `${displacementVal}L`;
      }
      const cylinders = getVal("Engine Number of Cylinders");
      if (cylinders) {
        engineText += ` V${cylinders}`;
      }
      const modelEngine = getVal("Engine Model");
      if (modelEngine) {
        engineText += ` ${modelEngine}`;
      } else {
        if (fuelTypePrimary && fuelTypePrimary.toLowerCase().includes("diesel")) {
          if (makeVal.toUpperCase().includes("RAM") || makeVal.toUpperCase().includes("DODGE")) {
            engineText += " Cummins Diesel";
          } else if (makeVal.toUpperCase().includes("FORD")) {
            engineText += " PowerStroke Diesel";
          } else if (makeVal.toUpperCase().includes("GMC") || makeVal.toUpperCase().includes("CHEVROLET")) {
            engineText += " Duramax Diesel";
          } else {
            engineText += " Diesel";
          }
        }
      }

      // Check Drivetrain (2WD/4x4)
      let driveVal = profile.drivetrain;
      if (driveTypeVal) {
        const lowerDrive = driveTypeVal.toLowerCase();
        if (lowerDrive.includes("2wd") || lowerDrive.includes("rwd") || lowerDrive.includes("fwd") || lowerDrive.includes("two-wheel") || lowerDrive.includes("4x2")) {
          driveVal = '2WD';
        } else if (lowerDrive.includes("4x4") || lowerDrive.includes("4wd") || lowerDrive.includes("awd") || lowerDrive.includes("four-wheel") || lowerDrive.includes("all-wheel")) {
          driveVal = '4x4';
        }
      }

      // Check Wheel Configuration (DRW / SRW)
      let wheelConfig = profile.duallyOrSrw;
      if (modelVal) {
        const lowerModel = modelVal.toLowerCase();
        if (lowerModel.includes('3500') || lowerModel.includes('f-350') || lowerModel.includes('f350') || 
            lowerModel.includes('4500') || lowerModel.includes('f-450') || lowerModel.includes('f450')) {
          wheelConfig = 'DRW';
        } else if (lowerModel.includes('2500') || lowerModel.includes('f-250') || lowerModel.includes('f250') || 
                   lowerModel.includes('1500') || lowerModel.includes('f-150') || lowerModel.includes('f150')) {
          wheelConfig = 'SRW';
        }
      }

      // Match Fuel Type
      let decodedFuel = profile.fuelType;
      if (fuelTypePrimary) {
        if (fuelTypePrimary.toLowerCase().includes("diesel")) {
          decodedFuel = 'Diesel';
        } else if (fuelTypePrimary.toLowerCase().includes("gasoline")) {
          decodedFuel = 'Gas';
        }
      }

      // Check if user has explicit custom entered strings that aren't options
      const preserveCustomMake = !['', 'Custom Option', 'RAM', 'DODGE', 'FORD', 'CHEVROLET', 'GMC', 'CHEVY'].includes((profile.powerUnitMake || '').toUpperCase());
      const preserveCustomEngine = profile.engineType && profile.engineType !== 'Custom Option' && ![
        '6.7L Cummins Diesel', '5.9L Cummins Diesel', '6.7L PowerStroke Diesel',
        '6.6L Duramax Diesel', '6.4L Hemi Gas V8', '7.3L Godzilla Gas V8',
        '6.6L Gas V8', '8.1L Vortec Gas V8', '6.0L PowerStroke Diesel', 'Custom'
      ].includes(profile.engineType);
      
      let preserveCustomModel = false;
      if (profile.powerUnitModel && profile.powerUnitModel !== 'Custom Option') {
        const knownModels = ['2500', '3500 HD', '4500', '5500', 'F-250', 'F-350', 'F-450', 'F-550', 'F-650', 'Silverado 1500', 'Silverado 2500 HD', 'Silverado 3500 HD', 'Sierra 1500', 'Sierra 2500 HD', 'Sierra 3500 HD'];
        if (!knownModels.includes(profile.powerUnitModel)) {
          preserveCustomModel = true;
        }
      }

      setProfile(p => ({
        ...p,
        vin: cleanVin,
        powerUnitYear: yearVal || p.powerUnitYear,
        powerUnitMake: preserveCustomMake ? p.powerUnitMake : (makeVal || p.powerUnitMake),
        powerUnitModel: preserveCustomModel ? p.powerUnitModel : (modelVal || p.powerUnitModel),
        engineType: preserveCustomEngine ? p.engineType : (engineText || p.engineType),
        drivetrain: driveVal,
        duallyOrSrw: wheelConfig,
        fuelType: decodedFuel
      }));

      setVinSuccess(`Decoded successfully! Loaded ${yearVal || ''} ${makeVal || ''} ${modelVal || ''}.`);
      setTimeout(() => setVinSuccess(''), 5000);
    } catch (err: any) {
      console.error("VIN decoding failed:", err);
      setVinError(err.message || "Failed to parse VIN. Enter details manually using the dropdowns.");
      setTimeout(() => setVinError(''), 5000);
    } finally {
      setDecodingVin(false);
    }
  };

  // Load profile from Firestore
  useEffect(() => {
    let active = true;
    const user = auth.currentUser;
    if (!user) {
      setLoadingProfile(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);
        let loadedData: any = null;
        if (snap.exists() && active) {
          loadedData = snap.data();
          localStorage.setItem('cache_userProfile_' + user.uid, JSON.stringify(loadedData));
        }

        if (loadedData && active) {
          setProfile({
            fuelType: loadedData.fuelType || 'Diesel',
            powerUnitYear: loadedData.powerUnitYear || '',
            powerUnitMake: loadedData.powerUnitMake || '',
            powerUnitModel: loadedData.powerUnitModel || '',
            engineType: loadedData.engineType || '',
            duallyOrSrw: loadedData.duallyOrSrw || 'DRW',
            drivetrain: loadedData.drivetrain || "4x4",
            powerUnitScaleWeight: loadedData.powerUnitScaleWeight || "",
            powerUnitWheelbase: loadedData.powerUnitWheelbase || 'LWB',
            otherVehicleNotes: loadedData.otherVehicleNotes || '',
            vin: loadedData.vin || '',
            operatorType: loadedData.operatorType || 'RV Tow Away',
            tireMake: loadedData.tireMake || '',
            tireType: loadedData.tireType || '',
            tireSize: loadedData.tireSize || '',
            trailerMake: loadedData.trailerMake || '',
            trailerModel: loadedData.trailerModel || '',
            trailerLength: loadedData.trailerLength || '',
            trailerWeight: loadedData.trailerWeight || ''
          });
          // Clear any stale local storage drafts so that we don't block subsequent device syncing
          localStorage.removeItem('userProfile_draft_' + user.uid);
        } else {
          const draft = localStorage.getItem('userProfile_draft_' + user.uid);
          if (draft && active) {
            const data = JSON.parse(draft);
            setProfile({
              fuelType: data.fuelType || 'Diesel',
              powerUnitYear: data.powerUnitYear || '',
              powerUnitMake: data.powerUnitMake || '',
              powerUnitModel: data.powerUnitModel || '',
              engineType: data.engineType || '',
              duallyOrSrw: data.duallyOrSrw || 'DRW',
              drivetrain: data.drivetrain || "4x4",
              powerUnitScaleWeight: data.powerUnitScaleWeight || "",
              powerUnitWheelbase: data.powerUnitWheelbase || 'LWB',
              otherVehicleNotes: data.otherVehicleNotes || '',
              vin: data.vin || '',
              operatorType: data.operatorType || 'RV Tow Away',
              tireMake: data.tireMake || '',
              tireType: data.tireType || '',
              tireSize: data.tireSize || '',
              trailerMake: data.trailerMake || '',
              trailerModel: data.trailerModel || '',
              trailerLength: data.trailerLength || '',
              trailerWeight: data.trailerWeight || ''
            });
          } else {
            const cache = localStorage.getItem('cache_userProfile_' + user.uid);
            if (cache && active) {
              const data = JSON.parse(cache);
              setProfile({
                fuelType: data.fuelType || 'Diesel',
                powerUnitYear: data.powerUnitYear || '',
                powerUnitMake: data.powerUnitMake || '',
                powerUnitModel: data.powerUnitModel || '',
                engineType: data.engineType || '',
                duallyOrSrw: data.duallyOrSrw || 'DRW',
                drivetrain: data.drivetrain || "4x4",
                powerUnitScaleWeight: data.powerUnitScaleWeight || "",
                powerUnitWheelbase: data.powerUnitWheelbase || 'LWB',
                otherVehicleNotes: data.otherVehicleNotes || '',
                vin: data.vin || '',
                operatorType: data.operatorType || 'RV Tow Away',
                tireMake: data.tireMake || '',
                tireType: data.tireType || '',
                tireSize: data.tireSize || '',
                trailerMake: data.trailerMake || '',
                trailerModel: data.trailerModel || '',
                trailerLength: data.trailerLength || '',
                trailerWeight: data.trailerWeight || ''
              });
            }
          }
        }
      } catch (err) {
        console.error("Error reading user profile:", err);
        const draft = localStorage.getItem('userProfile_draft_' + user.uid) || localStorage.getItem('cache_userProfile_' + user.uid);
        if (draft && active) {
          try {
            const data = JSON.parse(draft);
            setProfile({
              fuelType: data.fuelType || 'Diesel',
              powerUnitYear: data.powerUnitYear || '',
              powerUnitMake: data.powerUnitMake || '',
              powerUnitModel: data.powerUnitModel || '',
              engineType: data.engineType || '',
              duallyOrSrw: data.duallyOrSrw || 'DRW',
              drivetrain: data.drivetrain || "4x4",
              powerUnitScaleWeight: data.powerUnitScaleWeight || "",
              powerUnitWheelbase: data.powerUnitWheelbase || 'LWB',
              otherVehicleNotes: data.otherVehicleNotes || '',
              vin: data.vin || '',
              operatorType: data.operatorType || 'RV Tow Away',
              tireMake: data.tireMake || '',
              tireType: data.tireType || '',
              tireSize: data.tireSize || '',
              trailerMake: data.trailerMake || '',
              trailerModel: data.trailerModel || '',
              trailerLength: data.trailerLength || '',
              trailerWeight: data.trailerWeight || ''
            });
          } catch(e) {}
        }
      } finally {
        if (active) setLoadingProfile(false);
      }
    };

    fetchProfile();
    return () => { active = false; };
  }, []);

  // Save profile draft dynamically to localStorage as a failsafe
  useEffect(() => {
    const user = auth.currentUser;
    if (user && !loadingProfile && profile && Object.keys(profile).length > 0) {
      localStorage.setItem('userProfile_draft_' + user.uid, JSON.stringify(profile));
    }
  }, [profile, loadingProfile]);

  // Save profile to Firestore
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setSavingProfile(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const docRef = doc(db, 'users', user.uid);
      const payload = {
        fuelType: profile.fuelType,
        powerUnitYear: profile.powerUnitYear ? Number(profile.powerUnitYear) || profile.powerUnitYear : '',
        powerUnitMake: profile.powerUnitMake,
        powerUnitModel: profile.powerUnitModel,
        engineType: profile.engineType,
        duallyOrSrw: profile.duallyOrSrw,
        drivetrain: profile.drivetrain,
        powerUnitScaleWeight: profile.powerUnitScaleWeight ? Number(profile.powerUnitScaleWeight) || profile.powerUnitScaleWeight : "",
        powerUnitWheelbase: profile.powerUnitWheelbase,
        otherVehicleNotes: profile.otherVehicleNotes,
        vin: profile.vin,
        // Save new settings parameters
        operatorType: profile.operatorType || 'RV Tow Away',
        tireMake: profile.tireMake || '',
        tireType: profile.tireType || '',
        tireSize: profile.tireSize || '',
        trailerMake: profile.trailerMake || '',
        trailerModel: profile.trailerModel || '',
        trailerLength: profile.trailerLength ? Number(profile.trailerLength) || profile.trailerLength : '',
        trailerWeight: profile.trailerWeight ? Number(profile.trailerWeight) || profile.trailerWeight : ''
      };
      await setDoc(docRef, payload, { merge: true });
      localStorage.setItem('cache_userProfile_' + user.uid, JSON.stringify(payload));
      localStorage.removeItem('userProfile_draft_' + user.uid); // Done saving!

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error saving profile:", err);
      setSaveError(err.message || 'Failed to save profile. Check Firestore connection.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Register modern WebAuthn key
  const registerBiometrics = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setLoadingBio(true);
    setBioError('');
    setBioSuccess(false);

    try {
      const optionsRes = await fetch('/api/auth/generate-registration-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          userId: user.uid,
          displayName: user.displayName || 'Operator',
        }),
      });

      const options = await optionsRes.json();
      if (options.error) throw new Error(options.error);

      const regResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/verify-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: regResp,
          userId: user.uid,
        }),
      });

      const verification = await verifyRes.json();

      if (verification.verified) {
        setBioSuccess(true);
      } else {
        throw new Error('Verification failed');
      }
    } catch (err: any) {
      setBioError(err.message === 'The user canceled the operation.' ? 'Registration cancelled' : err.message);
    } finally {
      setLoadingBio(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-[40px] border border-slate-200 p-6 sm:p-10 shadow-sm">
        {/* Settings Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-8 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Settings className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">User & Fleet Settings</h2>
              <p className="text-sm text-slate-500 font-medium font-mono uppercase tracking-tight">
                Configure Power Unit profile & security protocols
              </p>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'profile' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Power Unit Profile
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'security' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Biometric Security
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'account' 
                  ? 'bg-red-50 text-red-700 shadow-sm border border-red-100' 
                  : 'text-slate-500 hover:text-red-600'
              }`}
            >
              Account Management
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="pt-8">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-indigo-600" />
                    Power Unit Configuration
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                    Define details for your regular towing vehicle. These specifications help calculate highly precise 
                    <strong> Delivery Efficiency Ratings</strong> and baseline target fuel usages tailored exactly to your equipment.
                  </p>
                </div>

                {loadingProfile ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <span className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest">Loading stored profiles...</span>
                  </div>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-6">
                    {/* VIN Specification Auto-Population Card */}
                    <div className="p-5 bg-gradient-to-r from-indigo-50/40 via-indigo-50/10 to-slate-50/50 border border-slate-200/60 rounded-[30px] space-y-3.5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <Activity className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                            VIN-SPECIFICATION AUTO-POPULATION
                          </label>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-relaxed">
                            Decode your truck specs instantly using the National Highway Traffic Safety Database (NHTSA) to calibrate targets automatically.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="relative w-full">
                          <input
                            type="text"
                            placeholder="ENTER 17-CHARACTER TRUCK VIN (e.g., 1C6RR7LT...)"
                            maxLength={17}
                            value={profile.vin}
                            onChange={(e) => setProfile(p => ({ ...p, vin: e.target.value.toUpperCase() }))}
                            className={`w-full bg-white border ${profile.vin.length === 17 ? 'border-green-300 ring-1 ring-green-100' : 'border-slate-200'} rounded-2xl px-4 py-3 text-xs font-mono font-bold uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800 tracking-wider`}
                          />
                          {profile.vin.length === 17 && (
                            <Check className="w-4 h-4 text-green-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={decodingVin || !profile.vin || profile.vin.length !== 17}
                          onClick={() => handleDecodeVin(profile.vin)}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold px-5 py-3.5 rounded-2xl transition-all shrink-0 flex items-center justify-center gap-2 shadow-sm pointer-events-auto"
                        >
                          {decodingVin ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Decoding VIN...
                            </>
                          ) : (
                            <>
                              <Activity className="w-3.5 h-3.5" />
                              {profile.vin.length === 17 ? 'Re-Decode & Auto-Fill' : 'Decode & Auto-Fill'}
                            </>
                          )}
                        </button>
                      </div>

                      <AnimatePresence>
                        {vinError && (
                          <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[10px] text-red-600 font-bold flex items-center gap-1.5 pt-0.5">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" /> {vinError}
                          </motion.div>
                        )}
                        {vinSuccess && (
                          <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[10px] text-green-700 font-bold flex items-center gap-1.5 pt-0.5">
                            <Check className="w-3.5 h-3.5 text-green-600 font-black shrink-0" /> {vinSuccess}
                          </motion.div>
                        )}
                        {!vinError && !vinSuccess && profile.vin.length === 17 && (
                           <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[10px] text-green-700 font-bold flex items-center gap-1.5 pt-0.5">
                            <Check className="w-3.5 h-3.5 text-green-600 font-black shrink-0" /> Configuration data anchored to this VIN
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Fuel Type Selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Primary Fuel Type
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, fuelType: 'Diesel' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2.5 transition-all ${
                              profile.fuelType === 'Diesel'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Fuel className="w-4 h-4 shrink-0" />
                            Ultra Diesel
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, fuelType: 'Gas' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2.5 transition-all ${
                              profile.fuelType === 'Gas'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Fuel className="w-4 h-4 shrink-0" />
                            Gasoline
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Used to filter index prices and baseline heat-transfer efficiency calculations.
                        </p>
                      </div>

                      {/* Dually vs SRW */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Rear Wheel Configuration
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, duallyOrSrw: 'DRW' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.duallyOrSrw === 'DRW'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            DRW (Dually)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, duallyOrSrw: 'SRW' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.duallyOrSrw === 'SRW'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            SRW (Single Wheel)
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Duallys face heavier drag, reducing target MPG baselines by 1.2 MPG.
                        </p>
                      </div>

                      {/* 2WD vs 4x4 Selector */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Drivetrain Configuration
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, drivetrain: '2WD' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.drivetrain === '2WD'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            2WD
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, drivetrain: '4x4' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.drivetrain === '4x4'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            4x4 / AWD
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          4x4 systems incur mechanical losses, adjusting baseline targets by -0.4 MPG.
                        </p>
                      </div>

                      {/* Wheelbase Length Selector */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Wheelbase Length Selection
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, powerUnitWheelbase: 'LWB' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.powerUnitWheelbase === 'LWB'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            LWB (Long Wheel Base)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, powerUnitWheelbase: 'SWB' }))}
                            className={`px-4 py-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                              profile.powerUnitWheelbase === 'SWB'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50'
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            SWB (Standard Wheel Base)
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Long wheel base vehicles are heavier and impact general turn radiuses and fuel averages.
                        </p>
                      </div>

                      {/* Power Unit Year */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">
                          Power Unit Year
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
                          <select
                            value={profile.powerUnitYear}
                            onChange={(e) => setProfile(p => ({ ...p, powerUnitYear: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800 appearance-none pointer-events-auto"
                          >
                            <option value="">Select Year...</option>
                            {Array.from({ length: 32 }, (_, i) => 2026 - i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Power Unit Scale Weight */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">
                          Scale Weight (lbs)
                        </label>
                        <div className="relative">
                          <Scale className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
                          <input
                            type="number"
                            value={profile.powerUnitScaleWeight}
                            onChange={(e) => setProfile(p => ({ ...p, powerUnitScaleWeight: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800"
                            placeholder="e.g. 7500"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">Unladen weight of the power unit, used to calculate accurate MPG targets.</p>
                      </div>

                      {/* Power Unit Make */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">
                          Vehicle Make
                        </label>
                        <select
                          value={COMMON_MAKES.includes(profile.powerUnitMake) ? profile.powerUnitMake : (profile.powerUnitMake ? 'Custom' : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'Custom') {
                              setProfile(p => ({ ...p, powerUnitMake: 'Custom Option', powerUnitModel: '', engineType: '' }));
                            } else {
                              setProfile(p => ({ ...p, powerUnitMake: val, powerUnitModel: '', engineType: '' }));
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800"
                        >
                          <option value="">Select Make...</option>
                          {COMMON_MAKES.map(make => (
                            <option key={make} value={make}>{make}</option>
                          ))}
                        </select>
                        {(!COMMON_MAKES.includes(profile.powerUnitMake) || profile.powerUnitMake === 'Custom Option') && (
                          <input
                            type="text"
                            placeholder="Enter Custom Make (e.g., Kenworth)"
                            value={profile.powerUnitMake === 'Custom Option' ? '' : profile.powerUnitMake}
                            onChange={(e) => setProfile(p => ({ ...p, powerUnitMake: e.target.value }))}
                            className="w-full mt-2 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-805 text-slate-800"
                          />
                        )}
                      </div>

                      {/* Power Unit Model */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">
                          Vehicle Model
                        </label>
                        {(() => {
                          const modelOptions = GET_MAKE_MODELS(profile.powerUnitMake);
                          const isKnownModel = modelOptions.includes(profile.powerUnitModel);
                          const displayVal = isKnownModel ? profile.powerUnitModel : (profile.powerUnitModel ? 'Custom' : '');
                          return (
                            <>
                              <select
                                value={displayVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'Custom') {
                                    setProfile(p => ({ ...p, powerUnitModel: 'Custom Option', engineType: '' }));
                                  } else {
                                    setProfile(p => ({ ...p, powerUnitModel: val, engineType: '' }));
                                  }
                                }}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800"
                              >
                                <option value="">Select Model...</option>
                                {modelOptions.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                              {(!isKnownModel || profile.powerUnitModel === 'Custom Option') && (
                                <input
                                  type="text"
                                  placeholder="Enter Custom Model (e.g., F-450 Platinum)"
                                  value={profile.powerUnitModel === 'Custom Option' ? '' : profile.powerUnitModel}
                                  onChange={(e) => setProfile(p => ({ ...p, powerUnitModel: e.target.value }))}
                                  className="w-full mt-2 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800"
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Engine Type */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">
                          Engine Type / Displacement
                        </label>
                        <div className="relative">
                          <Wrench className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
                          {(() => {
                            const engineOptions = GET_ENGINES_FOR_VEHICLE(profile.powerUnitMake, profile.powerUnitModel);
                            const isKnownEngine = engineOptions.includes(profile.engineType);
                            const displayEngineVal = isKnownEngine ? profile.engineType : (profile.engineType ? 'Custom' : '');
                            return (
                              <>
                                <select
                                  value={displayEngineVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'Custom') {
                                      setProfile(p => ({ ...p, engineType: 'Custom Option' }));
                                    } else {
                                      setProfile(p => ({ ...p, engineType: val }));
                                    }
                                  }}
                                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800 appearance-none"
                                >
                                  <option value="">Select Engine...</option>
                                  {engineOptions.map(e => (
                                    <option key={e} value={e}>{e}</option>
                                  ))}
                                </select>
                                {(!isKnownEngine || profile.engineType === 'Custom Option') && (
                                  <input
                                    type="text"
                                    placeholder="Enter Custom Engine Specs (e.g., 6.7L Cummins Diesel)"
                                    value={profile.engineType === 'Custom Option' ? '' : profile.engineType}
                                    onChange={(e) => setProfile(p => ({ ...p, engineType: e.target.value }))}
                                    className="w-full mt-2 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800"
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* SECTION: Operator Classification */}
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[30px] space-y-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-600" />
                          OPERATOR WORKSPACE CLASSIFICATION
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Configure your active layout mode. This changes terms, unit inputs, and workspace forms automatically.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(['RV Tow Away', 'RV Multi Haul', 'Hot Shot'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, operatorType: type }))}
                            className={`px-4 py-3.5 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                              profile.operatorType === type
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm ring-2 ring-indigo-100'
                                : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span>{type}</span>
                            <span className={`text-[9px] font-medium ${profile.operatorType === type ? 'text-indigo-100' : 'text-slate-400'}`}>
                              {type === 'RV Tow Away' && 'Single RV towing'}
                              {type === 'RV Multi Haul' && 'Up to 3 RVs transport'}
                              {type === 'Hot Shot' && 'LTL, Flatbed, freight'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* SECTION: High-Performance Tires Specification */}
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[30px] space-y-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          <Compass className="w-4 h-4 text-indigo-600" />
                          HIGH-PERFORMANCE TIRE SPECIFICATIONS
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tire parameters influence rolling resistance, wet-traction rolling diameter, and target MPG calibrations.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tire Make</label>
                          <input
                            type="text"
                            placeholder="e.g. Michelin"
                            value={profile.tireMake}
                            onChange={(e) => setProfile(p => ({ ...p, tireMake: e.target.value }))}
                            className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tire Type / Model</label>
                          <input
                            type="text"
                            placeholder="e.g. Defender LTX M/S 2"
                            value={profile.tireType}
                            onChange={(e) => setProfile(p => ({ ...p, tireType: e.target.value }))}
                            className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tire Size</label>
                          <input
                            type="text"
                            placeholder="e.g. 275/70 18R"
                            value={profile.tireSize}
                            onChange={(e) => setProfile(p => ({ ...p, tireSize: e.target.value }))}
                            className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION: Empty Trailer Specifications (RV Multi Haul & Hot Shot) */}
                    {(profile.operatorType === 'RV Multi Haul' || profile.operatorType === 'Hot Shot') && (
                      <div className="p-6 bg-slate-50 border border-slate-100 rounded-[30px] space-y-4">
                        <div>
                          <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            EMPTY TRAILER CONFIGURATION & WEIGHT BASELINE
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Required to calibrate aerodynamic drag and mass factors for empty deadhead (unloaded) tracking.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Trailer Make</label>
                            <input
                              type="text"
                              placeholder="e.g. Big Tex"
                              value={profile.trailerMake}
                              onChange={(e) => setProfile(p => ({ ...p, trailerMake: e.target.value }))}
                              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Trailer Model</label>
                            <input
                              type="text"
                              placeholder="e.g. 22GN Gooseneck"
                              value={profile.trailerModel}
                              onChange={(e) => setProfile(p => ({ ...p, trailerModel: e.target.value }))}
                              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Trailer Length (ft)</label>
                            <input
                              type="number"
                              placeholder="e.g. 40"
                              value={profile.trailerLength}
                              onChange={(e) => setProfile(p => ({ ...p, trailerLength: e.target.value }))}
                              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Empty Weight (lbs)</label>
                            <input
                              type="number"
                              placeholder="e.g. 8500"
                              value={profile.trailerWeight}
                              onChange={(e) => setProfile(p => ({ ...p, trailerWeight: e.target.value }))}
                              className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-800 animate-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Additional Notes */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">
                        Equipment & Mod Notes (Optional)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Note aux fuel tanks, aerodynamic upgrades, active programmers/tuners, or weight alterations..."
                        value={profile.otherVehicleNotes}
                        onChange={(e) => setProfile(p => ({ ...p, otherVehicleNotes: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-slate-800 resize-none"
                      />
                    </div>

                    {/* Message indicators */}
                    <AnimatePresence>
                      {saveSuccess && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center gap-3 text-green-700 text-xs font-bold"
                        >
                          <Check className="w-4 h-4 text-green-600 font-black shrink-0" />
                          Power Unit details successfully saved. Delivery Efficiency baseline calibrated!
                        </motion.div>
                      )}
                      {saveError && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3 text-red-700 text-xs font-bold"
                        >
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          {saveError}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {savingProfile ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Truck className="w-5 h-5" />
                      )}
                      {savingProfile ? 'Saving profile settings...' : 'Save and Calibrate Baselines'}
                    </button>
                  </form>
                )}
              </motion.div>
            ) : activeTab === 'security' ? (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                    Fingerprint & FaceID
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-6">
                    Enable biometric authentication for faster, more secure access to your fleet dashboard. Once enabled, you can sign in using your device&apos;s native security protocols.
                  </p>

                  <AnimatePresence mode="wait">
                    {bioSuccess ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-green-50 border border-green-100 p-4 rounded-2xl flex items-center gap-3 mb-4"
                      >
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-bold text-green-700">Biometric login active</span>
                      </motion.div>
                    ) : bioError ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 mb-4"
                      >
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <span className="text-sm font-bold text-red-700">{bioError}</span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {!bioSuccess && (
                    <button
                      onClick={registerBiometrics}
                      disabled={loadingBio}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loadingBio ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Fingerprint className="w-5 h-5" />
                      )}
                      {loadingBio ? 'Consulting Secure Element...' : 'Register New Biometric Key'}
                    </button>
                  )}
                </div>

                <div className="text-center pt-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">End-to-End Encryption Enforced</p>
                  <p className="text-[9px] text-slate-400 mt-1 max-w-[300px] mx-auto">Passwords are never stored local-side. Biometric tokens are hardware-isolated per industry standards.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 animate-fade-in"
              >
                {/* Deactivation Success Screen */}
                {deactivateSuccess ? (
                  <div className="p-8 bg-amber-50/80 border border-amber-200 rounded-[32px] md:p-10 text-center space-y-6">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                      <UserX className="w-8 h-8 text-amber-700 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-black text-amber-900 tracking-tight">
                        Account Successfully Deleted & Deactivated
                      </h4>
                      <p className="text-xs text-amber-800 leading-relaxed max-w-md mx-auto">
                        Your LOD login and profile credentials have been properly cleared. All personal data, including email handles, notifications, and vehicle identification records (VIN) have been permanently purged.
                      </p>
                      <p className="text-xs text-amber-700 font-medium leading-relaxed max-w-md mx-auto">
                        Your baseline unladen scales and hardware layouts are preserved anonymously to safe-keep global logistics benchmarks for peer data aggregation.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => auth.signOut()}
                      className="py-3 px-6 bg-amber-900 hover:bg-amber-950 text-white font-bold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-sm hover:shadow-md cursor-pointer"
                    >
                      Finalize & Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Software Build & Status */}
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-blue-600" />
                        Software Build & Live Sync
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                        Monitor your active application build version. Transport LogIQ automatically maintains the latest software updates and manages local offline caches in the background. No manual steps are required.
                      </p>
                    </div>

                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Active Software Build</p>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-extrabold rounded-lg border border-emerald-100 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              {(import.meta as any).env?.VITE_APP_VERSION || 'development'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-xs font-bold text-slate-500 flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                          Auto-Update Active
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-100 my-2" />

                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <UserX className="w-5 h-5 text-red-600" />
                        Account Access & Deactivation
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                        Manage your live account access. If you decide to deactivate or delete your account, your profile is permanently locked and your active session will end.
                      </p>
                    </div>

                    <div className="p-6 bg-red-50/50 border border-red-100 rounded-3xl space-y-4">
                      <h4 className="text-xs font-black text-red-950 uppercase tracking-wider flex items-center gap-1.5">
                        ⚠️ Warning: Deactivation Data Policy
                      </h4>
                      <p className="text-xs text-red-800 leading-relaxed">
                        Deactivating your account is terminal and irreversible. Personal identifying fields will be cleared, but your power unit specs, unladen weights, and anonymous haul stats (MPG benchmarks) will be retained for global logistics metrics and data aggregation.
                      </p>

                      <div className="p-3.5 bg-white border border-red-200/50 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Associated Account</span>
                        <span className="text-xs font-mono font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150">{auth.currentUser?.email || 'N/A'}</span>
                      </div>

                      <div className="pt-4 border-t border-red-100 flex justify-start">
                        <button
                          type="button"
                          onClick={() => {
                            setShowConfirmModal(true);
                            setShowSecondConfirmModal(false);
                            setVerificationText('');
                          }}
                          className="py-3 px-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition-colors shadow-xs hover:shadow-md cursor-pointer flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Deactivate / Delete My Account
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modals for Account Deactivation */}
        <AnimatePresence>
          {showConfirmModal && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[20000] animate-fade-in">
              <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl max-w-sm w-full p-6 sm:p-8 space-y-6 text-center animate-scale-in">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    Step 1: First Confirmation
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Are you absolutely sure you want to delete and deactivate the account associated with <span className="font-semibold text-slate-900 font-mono text-[11px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{auth.currentUser?.email}</span>? This is step 1 of double verification.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-3 px-4 bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    No, Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmModal(false);
                      setShowSecondConfirmModal(true);
                    }}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-2xl uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Yes, Proceed
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSecondConfirmModal && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[20000] animate-fade-in">
              <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl max-w-sm w-full p-6 sm:p-8 space-y-6 animate-scale-in">
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-750 text-red-700">
                    <UserX className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-black text-slate-800 tracking-tight">
                      Step 2: Final Confirmation
                    </h3>
                    <p className="text-xs text-red-600 font-bold uppercase tracking-wider">
                      This is your last and final warning!
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      To safely authorize permanent deactivation and data stripping for <span className="font-semibold text-slate-900 font-mono text-[11px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{auth.currentUser?.email}</span>, type <span className="font-bold text-red-600">DELETE</span> in the input below.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={verificationText}
                    onChange={(e) => setVerificationText(e.target.value)}
                    placeholder="Type DELETE here..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-center text-sm font-bold placeholder-slate-300 text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 focus:bg-white transition-all uppercase"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecondConfirmModal(false);
                      setVerificationText('');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Abort
                  </button>
                  <button
                    type="button"
                    disabled={deactivating || verificationText.trim().toUpperCase() !== 'DELETE'}
                    onClick={handleDeactivateAndSignOut}
                    className="flex-1 py-3 px-4 bg-red-700 hover:bg-red-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-2xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    {deactivating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Deactivate Now'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

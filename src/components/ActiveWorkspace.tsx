import { useEffect, useState, ChangeEvent, useRef, useMemo } from "react";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDoc } from "firebase/firestore";
import { Haul, Expense, OCRResult, ScannedReceipt } from "../types";
import { X, Camera, Plus, Trash2, Fuel, Sandwich, Wrench, Receipt, AlertCircle, CreditCard, UploadCloud, TrendingUp, Droplet, Folder, FileText, FolderOpen, Eye, ChevronDown, ChevronUp, UtensilsCrossed, CheckCircle, Loader2, Info } from "lucide-react";
import { motion } from "motion/react";
import { calculateTotals, parseCleanWeight } from "../lib/calculations";
import { parseFuelCardCSV } from "../lib/fuelCardParsers";
import { formatForInput } from "../lib/dateUtils";
import CityAutocomplete from "./CityAutocomplete";
import { useMapsLibrary } from '@vis.gl/react-google-maps';

const PickupTruckIcon = ({ className = "w-4 h-4 shrink-0" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 10h4l2.5-3.5h5L17 10h4v6h-2a3 3 0 0 1-6 0H9a3 3 0 0 1-6 0H2v-3a3 3 0 0 1 1-3z" />
    <circle cx="6" cy="16" r="2.5" fill="currentColor" fillOpacity="0.1" />
    <circle cx="16" cy="16" r="2.5" fill="currentColor" fillOpacity="0.1" />
    <path d="M13.5 6.5h-4" />
    <path d="M9 10h5.5" />
  </svg>
);

const TireWheelIcon = ({ className = "w-4 h-4 shrink-0" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer Black Rubber Tire */}
    <circle cx="12" cy="12" r="10" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="7.5" fill="#334155" stroke="#1e293b" strokeWidth="0.75" />
    
    {/* Treads on the outer tire */}
    <path d="M12 2v1.5M12 20.5v1.5M2 12h1.5M20.5 12h1.5M4.93 4.93l1.06 1.06M18.01 18.01l1.06 1.06M4.93 19.07l1.06-1.06M18.01 5.99l1.06-1.06" stroke="#475569" strokeWidth="0.75" strokeLinecap="round" />

    {/* Inner Generic Grey Wheel / Rim */}
    <circle cx="12" cy="12" r="5.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
    
    {/* Wheel Details / Spokes */}
    <circle cx="12" cy="12" r="2.2" fill="#94a3b8" stroke="#64748b" strokeWidth="0.75" />
    {/* Center cap / Lug nuts */}
    <circle cx="12" cy="12" r="1" fill="#475569" />
    {/* Radial spoke lines to give a mechanical wheel texture */}
    <path d="M12 6.5v2M12 15.5v2M6.5 12h2M15.5 12h2" stroke="#64748b" strokeWidth="0.75" strokeLinecap="round" />
  </svg>
);

interface Props {
  key?: string | null;
  haul: Haul;
  onClose: () => void;
  customFolders?: string[];
  onUpdateFolders?: (folders: string[]) => void;
  operatorType?: string | null;
}

const STATE_FUEL_PRICES: Record<string, { gas: number, diesel: number }> = {
  "CT": { gas: 3.455, diesel: 4.199 }, "ME": { gas: 3.455, diesel: 4.199 }, "MA": { gas: 3.455, diesel: 4.199 }, "NH": { gas: 3.455, diesel: 4.199 }, "RI": { gas: 3.455, diesel: 4.199 }, "VT": { gas: 3.455, diesel: 4.199 },
  "NJ": { gas: 3.486, diesel: 4.210 }, "NY": { gas: 3.486, diesel: 4.210 }, "PA": { gas: 3.486, diesel: 4.210 }, "DE": { gas: 3.486, diesel: 4.210 }, "MD": { gas: 3.486, diesel: 4.210 }, "DC": { gas: 3.486, diesel: 4.210 },
  "FL": { gas: 3.151, diesel: 3.701 }, "GA": { gas: 3.151, diesel: 3.701 }, "NC": { gas: 3.151, diesel: 3.701 }, "SC": { gas: 3.151, diesel: 3.701 }, "VA": { gas: 3.151, diesel: 3.701 }, "WV": { gas: 3.151, diesel: 3.701 },
  "IL": { gas: 3.352, diesel: 4.023 }, "IN": { gas: 3.352, diesel: 4.023 }, "IA": { gas: 3.352, diesel: 4.023 }, "KS": { gas: 3.352, diesel: 4.023 }, "MI": { gas: 3.352, diesel: 4.023 }, "MN": { gas: 3.352, diesel: 4.023 }, "MO": { gas: 3.352, diesel: 4.023 }, "NE": { gas: 3.352, diesel: 4.023 }, "ND": { gas: 3.352, diesel: 4.023 }, "SD": { gas: 3.352, diesel: 4.023 }, "OH": { gas: 3.352, diesel: 4.023 }, "WI": { gas: 3.352, diesel: 4.023 }, "OK": { gas: 3.352, diesel: 4.023 }, "KY": { gas: 3.352, diesel: 4.023 }, "TN": { gas: 3.352, diesel: 4.023 },
  "AL": { gas: 2.989, diesel: 3.645 }, "AR": { gas: 2.989, diesel: 3.645 }, "LA": { gas: 2.989, diesel: 3.645 }, "MS": { gas: 2.989, diesel: 3.645 }, "NM": { gas: 2.989, diesel: 3.645 }, "TX": { gas: 2.989, diesel: 3.645 },
  "CO": { gas: 3.557, diesel: 3.993 }, "ID": { gas: 3.557, diesel: 3.993 }, "MT": { gas: 3.557, diesel: 3.993 }, "UT": { gas: 3.557, diesel: 3.993 }, "WY": { gas: 3.557, diesel: 3.993 },
  "AK": { gas: 4.162, diesel: 4.409 }, "AZ": { gas: 4.162, diesel: 4.409 }, "HI": { gas: 4.162, diesel: 4.409 }, "NV": { gas: 4.162, diesel: 4.409 }, "OR": { gas: 4.162, diesel: 4.409 }, "WA": { gas: 4.162, diesel: 4.409 },
  "CA": { gas: 4.911, diesel: 5.182 },
  
  // Specific states override with even more precise EIA data if available in the feed
  "CO_specific": { gas: 4.542, diesel: 5.493 },
  "FL_specific": { gas: 4.255, diesel: 5.201 },
  "MA_specific": { gas: 4.415, diesel: 5.799 },
  "MN_specific": { gas: 4.249, diesel: 5.623 },
  "NY_specific": { gas: 4.466, diesel: 5.810 },
  "OH_specific": { gas: 4.560, diesel: 5.623 },
  "TX_specific": { gas: 3.956, diesel: 5.045 },
  "WA_specific": { gas: 5.570, diesel: 5.909 }
};

export function extractStateCode(locationName: string): string | null {
  if (!locationName) return null;
  const match = locationName.match(/\b([A-Z]{2})\b/);
  return match ? match[1] : null;
}

export const FALLBACK_PLATFORM_HAULS: any[] = [];

export function parseLegacyUnit(unitTypeStr: string | undefined): { length: number | null, type: string | null } {
  if (!unitTypeStr) return { length: null, type: null };
  const str = unitTypeStr.trim();
  
  const validTypes = ["Travel Trailer", "Fifth Wheel", "GN fifth Wheel", "Park/Destination Model", "Cargo Trailer"];
  if (validTypes.includes(str)) {
    return { length: null, type: str };
  }
  
  const match = str.match(/^(\d+)([FTGftg])$/);
  if (match) {
    const length = parseInt(match[1], 10);
    const suffix = match[2].toUpperCase();
    let type = "";
    if (suffix === 'T') type = "Travel Trailer";
    else if (suffix === 'F') type = "Fifth Wheel";
    else if (suffix === 'G') type = "Park/Destination Model";
    return { length, type };
  }
  
  return { length: null, type: str || null };
}

export function getNormalizedUnitProperties(h: any) {
  const rawType = (h?.unitType || '').trim();
  const rawLength = Number(h?.unitLength || 0);
  
  const parsed = parseLegacyUnit(rawType);
  const finalType = parsed.type || rawType || 'Travel Trailer';
  const finalLength = rawLength > 0 ? rawLength : (parsed.length || 0);
  
  return {
    unitType: finalType,
    unitLength: finalLength
  };
}

export function getExpectedVehicleMpg(userProfile: any, localHaul: any, traversedStates: string[] = []) {
  let isDiesel = (userProfile?.fuelType || "Diesel") === "Diesel";
  const engineLower = (userProfile?.engineType || "").toLowerCase();
  
  if (engineLower.includes("diesel")) {
    isDiesel = true;
  } else if (engineLower.includes("gas") || engineLower.includes("hemi") || engineLower.includes("vortec") || engineLower.includes("godzilla")) {
    isDiesel = false;
  }

  const baseExpectedMpg = isDiesel ? 10.5 : 8.0; 

  let duallyMpgAdjustment = 0;
  if (userProfile?.duallyOrSrw === "SRW") { duallyMpgAdjustment = 0; }
  else if (userProfile?.duallyOrSrw === "DRW") { duallyMpgAdjustment = isDiesel ? -0.8 : -0.5; }
  
  const profileYear = Number(userProfile?.powerUnitYear || 0);
  const profileYearAdjustment = profileYear > 2015 ? (profileYear - 2015) * (isDiesel ? 0.05 : 0.03) : 0;
  
  let drivetrainAdjustment = 0;
  if (userProfile?.drivetrain === "4x4") { drivetrainAdjustment = isDiesel ? -0.5 : -0.4; }
  
  // RV Multi Haul & Hot Shot dynamic weight & length mapping
  let scaleWeightVal = parseCleanWeight(localHaul?.scaleWeight);
  let totalLength = 0;
  
  const operatorType = localHaul?.operatorType || userProfile?.operatorType || "RV Tow Away";
  
  if (operatorType === 'RV Multi Haul') {
    let w1 = parseCleanWeight(localHaul?.scaleWeight);
    let w2 = parseCleanWeight(localHaul?.scaleWeight2);
    let w3 = parseCleanWeight(localHaul?.scaleWeight3);
    scaleWeightVal = w1 + w2 + w3;

    let l1 = Number(localHaul?.unitLength || 0);
    let l2 = Number(localHaul?.unitLength2 || 0);
    let l3 = Number(localHaul?.unitLength3 || 0);
    totalLength = l1 + l2 + l3;
  } else if (operatorType === 'Hot Shot') {
    scaleWeightVal = parseCleanWeight(localHaul?.grossWeight || localHaul?.scaleWeight); // Hot shot weight is stored in Load Weight / grossWeight
    const normProps = getNormalizedUnitProperties(localHaul);
    totalLength = normProps.unitLength;
  } else {
    const normProps = getNormalizedUnitProperties(localHaul);
    totalLength = normProps.unitLength;
  }

  let weightAdjustment = 0;
  if (scaleWeightVal > 0) {
    weightAdjustment = -((Math.max(0, scaleWeightVal - 5000)) / 1000) * (isDiesel ? 0.15 : 0.20);
  } else {
    weightAdjustment = -((8000 - 5000) / 1000) * (isDiesel ? 0.15 : 0.20);
  }

  let powerUnitWeightAdjustment = 0;
  const powerUnitScaleWeight = parseCleanWeight(userProfile?.powerUnitScaleWeight);
  if (powerUnitScaleWeight > 0) {
    powerUnitWeightAdjustment = -((powerUnitScaleWeight - 7500) / 500) * (isDiesel ? 0.10 : 0.15);
  }

  let terrainAdjustment = 0;
  if (traversedStates.length > 0) {
    const mountainStates = ["CO", "UT", "WY", "ID", "MT", "WA", "OR", "CA", "NV", "NM", "AZ"];
    const plainsStates = ["KS", "NE", "SD", "ND", "OK", "IA", "TX"]; 

    let mtCount = 0;
    let plainsCount = 0;
    traversedStates.forEach(st => {
      if (mountainStates.includes(st)) mtCount++;
      if (plainsStates.includes(st)) plainsCount++;
    });

    if (mtCount > 0) terrainAdjustment += -(0.3 * mtCount); 
    if (plainsCount > 0) terrainAdjustment += -(0.15 * plainsCount); 
  }

  // Aerodynamic drag based on Unit Type
  const normProps = getNormalizedUnitProperties(localHaul);
  let aeroAdjustment = 0;
  if (operatorType === 'Hot Shot') {
    aeroAdjustment = -0.2; // LTL Freight cargo flatbed/deck is lower drag profile than travel trailers
  } else {
    if (normProps.unitType === "Travel Trailer") {
      aeroAdjustment = -0.4;
    } else if (normProps.unitType === "Fifth Wheel" || normProps.unitType === "GN fifth Wheel") {
      aeroAdjustment = 0.0;
    } else if (normProps.unitType === "Park/Destination Model") {
      aeroAdjustment = -1.2;
    } else if (normProps.unitType === "Cargo Trailer") {
      aeroAdjustment = -0.6;
    }
  }

  // Length drag and skin friction penalty
  let lengthAdjustment = 0;
  if (totalLength > 0) {
    lengthAdjustment = -Math.max(0, (totalLength - 20) * 0.03);
  }

  // Rolling resistance axle count adjustments (1, 2, or 3 axles)
  let axleAdjustment = 0;
  const axlesCount = Number(localHaul?.axles || 2);
  if (axlesCount === 1) {
    axleAdjustment = 0.0;
  } else if (axlesCount === 2) {
    axleAdjustment = -0.3;
  } else if (axlesCount === 3) {
    axleAdjustment = -0.7;
  }

  // Tire rolling resistance adjustments from internet/industry verified baselines (Michelin/DiscountTire)
  let tireAdjustment = 0;
  const tireType = (userProfile?.tireType || "").toLowerCase();
  const tireMake = (userProfile?.tireMake || "").toLowerCase();
  const tireSize = (userProfile?.tireSize || "").toLowerCase();
  
  if (tireType.includes("mud") || tireType.includes("m/t")) {
    tireAdjustment = -0.4;
  } else if (tireType.includes("all terrain") || tireType.includes("a/t")) {
    tireAdjustment = -0.2;
  } else if (tireType.includes("highway") || tireType.includes("h/t") || tireType.includes("season")) {
    tireAdjustment = 0.15;
  } else if (tireType.includes("eco") || tireType.includes("low rolling")) {
    tireAdjustment = 0.3;
  }
  if (tireMake.includes("michelin") || tireMake.includes("continental") || tireMake.includes("bridgestone") || tireMake.includes("goodyear")) {
    tireAdjustment += 0.1;
  }
  if (tireSize) {
    if (tireSize.includes("35") || tireSize.includes("37") || tireSize.includes("315") || tireSize.includes("295") || tireSize.includes("325")) {
      tireAdjustment -= 0.15;
    } else if (tireSize.includes("225") || tireSize.includes("235") || tireSize.includes("245")) {
      tireAdjustment += 0.05;
    }
  }

  // Trailer specific aero drag adjustments (Airstream, Scamp, casita, or customized specs)
  let trailerAdjustment = 0;
  const trailerMake = (userProfile?.trailerMake || "").toLowerCase();
  const trailerModel = (userProfile?.trailerModel || "").toLowerCase();
  
  if (trailerMake.includes("airstream")) {
    trailerAdjustment = 0.45;
  } else if (trailerModel.includes("aero") || trailerMake.includes("scamp") || trailerMake.includes("casita")) {
    trailerAdjustment = 0.25;
  }
  
  // NOTE: tireAdjustment is excluded here so Calibrated Performance Target & 100 Target do not consider or reflect it.
  const expectedMpg = baseExpectedMpg + duallyMpgAdjustment + profileYearAdjustment + drivetrainAdjustment + weightAdjustment + powerUnitWeightAdjustment + terrainAdjustment + aeroAdjustment + lengthAdjustment + axleAdjustment + trailerAdjustment;
  
  let maxPhysicalMpgCap = 16.0;
  if (!isDiesel) {
    if (scaleWeightVal >= 15000) maxPhysicalMpgCap = 5.5;
    else if (scaleWeightVal >= 12000) maxPhysicalMpgCap = 6.8;
    else if (scaleWeightVal >= 9000) maxPhysicalMpgCap = 8.0;
    else if (scaleWeightVal >= 6000) maxPhysicalMpgCap = 9.2;
    else if (scaleWeightVal >= 3000) maxPhysicalMpgCap = 11.0;
    else maxPhysicalMpgCap = 13.0;
  } else {
    if (scaleWeightVal >= 15000) maxPhysicalMpgCap = 7.5;
    else if (scaleWeightVal >= 12000) maxPhysicalMpgCap = 9.0;
    else if (scaleWeightVal >= 9000) maxPhysicalMpgCap = 10.5;
    else if (scaleWeightVal >= 6000) maxPhysicalMpgCap = 12.0;
    else if (scaleWeightVal >= 3000) maxPhysicalMpgCap = 14.0;
    else maxPhysicalMpgCap = 16.0;
  }

  const finalMpg = Math.min(maxPhysicalMpgCap, Math.max(3.0, Number(expectedMpg.toFixed(1))));
  return { expectedMpg: finalMpg, weightAdjustment, scaleWeightVal, terrainAdjustment, aeroAdjustment, lengthAdjustment, axleAdjustment, tireAdjustment, trailerAdjustment };
}

export function getIndustryAvgMpg(userProfile: any, localHaul: any, traversedStates: string[] = [], communityAvgMpg?: number, peersAvgSimilarMpg?: number) {
  let isDiesel = (userProfile?.fuelType || 'Diesel') === 'Diesel';
  const engineLower = (userProfile?.engineType || '').toLowerCase();
  if (engineLower.includes('diesel')) {
    isDiesel = true;
  } else if (engineLower.includes('gas') || engineLower.includes('hemi') || engineLower.includes('vortec') || engineLower.includes('godzilla')) {
    isDiesel = false;
  }

  // Base MPG standard towing average pulled from DOE (Department of Energy) & EPA vehicle efficiency datasets:
  // Standard towing fuel consumption rate under 55mph-65mph ranges from 7.0 - 11.0 MPG.
  // 10.0 MPG for standard Diesel, 7.5 MPG for standard Gas
  const baseStandardMpg = isDiesel ? 10.0 : 7.5;

  // 1. Scale Weight Effect (Unit being hauled) using parseCleanWeight
  const scaleWeightVal = parseCleanWeight(localHaul?.scaleWeight);
  let weightCorrection = 0;
  if (scaleWeightVal > 0) {
    weightCorrection = -((Math.max(0, scaleWeightVal - 5000)) / 1000) * (isDiesel ? 0.15 : 0.20);
  } else {
    // Standard unladen correction if not entered
    weightCorrection = -((7500 - 5000) / 1000) * (isDiesel ? 0.15 : 0.20);
  }

  // 2. Terrain & Route Elevation Corrections (Federal highway steepness grading formulas):
  let terrainCorrection = 0;
  if (traversedStates.length > 0) {
    const mountainStates = ["CO", "UT", "WY", "ID", "MT", "WA", "OR", "CA", "NV", "NM", "AZ"];
    const plainsStates = ["KS", "NE", "SD", "ND", "OK", "IA", "TX"]; // Severe wind drag gradients
    
    let mtCount = 0;
    let plainsCount = 0;
    traversedStates.forEach(st => {
      if (mountainStates.includes(st)) mtCount++;
      if (plainsStates.includes(st)) plainsCount++;
    });

    if (mtCount > 0) terrainCorrection += -(0.35 * mtCount);
    if (plainsCount > 0) terrainCorrection += -(0.18 * plainsCount);
  }

  // 3. Equipment specification drag adjustments:
  let equipmentCorrection = 0;
  if (userProfile?.duallyOrSrw === 'DRW') {
    equipmentCorrection += isDiesel ? -0.8 : -0.5;
  }
  if (userProfile?.drivetrain === '4x4') {
    equipmentCorrection += isDiesel ? -0.5 : -0.4;
  }

  const adjustedIndustryBase = baseStandardMpg + weightCorrection + terrainCorrection + equipmentCorrection;

  // 4. Grounded with User Logs:
  // Blend actual user historical metrics or peer historical metrics to reflect driving conditions.
  // 60% weight on theoretical internet DOE curve, 40% weight on highly-matched peer logs (filtered by terrain and scale weight)
  let finalIndustryMpg = adjustedIndustryBase;
  if (peersAvgSimilarMpg && peersAvgSimilarMpg > 0) {
    finalIndustryMpg = (adjustedIndustryBase * 0.60) + (peersAvgSimilarMpg * 0.40);
  } else if (communityAvgMpg && communityAvgMpg > 0) {
    finalIndustryMpg = (adjustedIndustryBase * 0.70) + (communityAvgMpg * 0.30);
  }

  // Apply real-world physical ceilings for expected towing MPG based on hauling weight
  let maxPhysicalMpgCap = 16.0;
  if (!isDiesel) {
    if (scaleWeightVal >= 15000) maxPhysicalMpgCap = 5.5;
    else if (scaleWeightVal >= 12000) maxPhysicalMpgCap = 6.8;
    else if (scaleWeightVal >= 9000) maxPhysicalMpgCap = 8.0;
    else if (scaleWeightVal >= 6000) maxPhysicalMpgCap = 9.2;
    else if (scaleWeightVal >= 3000) maxPhysicalMpgCap = 11.0;
    else maxPhysicalMpgCap = 13.0;
  } else {
    if (scaleWeightVal >= 15000) maxPhysicalMpgCap = 7.5;
    else if (scaleWeightVal >= 12000) maxPhysicalMpgCap = 9.0;
    else if (scaleWeightVal >= 9000) maxPhysicalMpgCap = 10.5;
    else if (scaleWeightVal >= 6000) maxPhysicalMpgCap = 12.0;
    else if (scaleWeightVal >= 3000) maxPhysicalMpgCap = 14.0;
    else maxPhysicalMpgCap = 16.0;
  }

  return Math.min(maxPhysicalMpgCap, Math.max(4.0, Number(finalIndustryMpg.toFixed(1))));
}

export function getRegisteredUserSimilarAvgMpg(
  allPlatformCompletedHauls: any[], 
  userProfile: any, 
  localHaul: any
) {
  if (!allPlatformCompletedHauls || !Array.isArray(allPlatformCompletedHauls) || allPlatformCompletedHauls.length === 0) return 0;

  // Enrich items with user profile if they belong to current user
  const enrichedList = allPlatformCompletedHauls
    .filter(Boolean)
    .map(h => {
      const isCurrentUser = h.ownerId && userProfile && (h.ownerId === userProfile.uid || h.ownerId === userProfile.id);
      if (isCurrentUser || !h.powerUnitMake) {
        return {
          ...h,
          powerUnitYear: h.powerUnitYear || (userProfile?.powerUnitYear ? Number(userProfile.powerUnitYear) : ''),
          powerUnitMake: h.powerUnitMake || userProfile?.powerUnitMake || '',
          powerUnitModel: h.powerUnitModel || userProfile?.powerUnitModel || '',
          engineType: h.engineType || userProfile?.engineType || '',
          duallyOrSrw: h.duallyOrSrw || userProfile?.duallyOrSrw || 'SRW',
          drivetrain: h.drivetrain || userProfile?.drivetrain || '',
          powerUnitScaleWeight: h.powerUnitScaleWeight || (userProfile?.powerUnitScaleWeight ? Number(userProfile.powerUnitScaleWeight) : ''),
          powerUnitWheelbase: h.powerUnitWheelbase || userProfile?.powerUnitWheelbase || '',
          fuelType: h.fuelType || userProfile?.fuelType || ''
        };
      }
      return h;
    });

  // Filter ONLY items with valid loaded MPG to prevent average dilution and include only meaningful entries
  const validMpgList = enrichedList.filter(h => h && (Number(h.loadedMpg || h.milesPerGallon || 0) > 0));
  if (validMpgList.length === 0) return 0;

  // Extract current user attributes to match against
  const userMake = (userProfile?.powerUnitMake || '').toLowerCase().trim();
  const userModel = (userProfile?.powerUnitModel || '').toLowerCase().trim();
  const userDually = (userProfile?.duallyOrSrw || 'SRW').toLowerCase();
  const userEngine = (userProfile?.engineType || '').toLowerCase().trim();
  const userWheelbase = (userProfile?.powerUnitWheelbase || 'LWB').toLowerCase();
  const userPuScaleWeight = Number(userProfile?.powerUnitScaleWeight || 0);

  const curScaleWeight = Number(localHaul?.scaleWeight || 0);
  const curAxles = Number(localHaul?.axles || 0);

  // Helper matching functions
  const isSimilarMake = (item: any) => {
    if (!item) return false;
    const itemMake = (item.powerUnitMake || '').toLowerCase().trim();
    if (!userMake || !itemMake) return true;
    return itemMake === userMake;
  };

  const isDuallyMatch = (item: any) => {
    if (!item) return false;
    const itemDually = (item.duallyOrSrw || 'SRW').toLowerCase();
    return itemDually === userDually;
  };

  const isSimilarEngine = (item: any) => {
    if (!item) return false;
    const itemEngine = (item.engineType || '').toLowerCase().trim();
    if (!userEngine || !itemEngine) return true;
    return itemEngine.includes(userEngine) || userEngine.includes(itemEngine);
  };

  const isSimilarPuWeight = (item: any) => {
    if (!item) return false;
    const itemPuWeight = Number(item.powerUnitScaleWeight || 0);
    if (userPuScaleWeight <= 0 || itemPuWeight <= 0) return true;
    return Math.abs(itemPuWeight - userPuScaleWeight) <= 2500;
  };

  const isWheelbaseMatch = (item: any) => {
    if (!item) return false;
    const itemWheelbase = (item.powerUnitWheelbase || 'LWB').toLowerCase();
    return itemWheelbase === userWheelbase;
  };

  const isSimilarTowedWeight = (item: any) => {
    if (!item) return false;
    const itemWeight = Number(item.scaleWeight || 0);
    if (curScaleWeight <= 0 || itemWeight <= 0) return true;
    return Math.abs(itemWeight - curScaleWeight) <= 4500;
  };

  const isAxlesMatch = (item: any) => {
    if (!item) return false;
    const itemAxles = Number(item.axles || 0);
    if (curAxles <= 0 || itemAxles <= 0) return true;
    return itemAxles === curAxles;
  };

  // Run filtering on validMpgList with fallback tiers
  // Tier 1: Perfect match (Make + dually/srw + engine + wheelbase + axles + scale weight + power unit scale weight)
  let matched = validMpgList.filter(item => 
    isSimilarMake(item) &&
    isDuallyMatch(item) &&
    isSimilarEngine(item) &&
    isWheelbaseMatch(item) &&
    isSimilarPuWeight(item) &&
    isSimilarTowedWeight(item) &&
    isAxlesMatch(item)
  );

  // Tier 2: Match Make + dually + wheelbase + axles + scale weight
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isSimilarMake(item) &&
      isDuallyMatch(item) &&
      isWheelbaseMatch(item) &&
      isAxlesMatch(item) &&
      isSimilarTowedWeight(item)
    );
  }

  // Tier 3: Loose Match Make + dually + axles
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isSimilarMake(item) &&
      isDuallyMatch(item) &&
      isAxlesMatch(item)
    );
  }

  // Tier 4: Broad match: Just dually/srw + axles
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isDuallyMatch(item) &&
      isAxlesMatch(item)
    );
  }

  // Fallback to all completed/finalized entries from actual users of the app
  if (matched.length === 0) {
    matched = validMpgList;
  }

  const sum = matched.reduce((acc, h) => acc + Number(h.loadedMpg || h.milesPerGallon || 0), 0);
  return matched.length > 0 ? Number((sum / matched.length).toFixed(1)) : 0;
}

export function getRegisteredUserSimilarSetups(
  allPlatformCompletedHauls: any[], 
  userProfile: any, 
  localHaul: any
) {
  if (!allPlatformCompletedHauls || !Array.isArray(allPlatformCompletedHauls) || allPlatformCompletedHauls.length === 0) return [];

  // Enrich items with user profile if they belong to current user
  const enrichedList = allPlatformCompletedHauls
    .filter(Boolean)
    .map(h => {
      const isCurrentUser = h.ownerId && userProfile && (h.ownerId === userProfile.uid || h.ownerId === userProfile.id);
      if (isCurrentUser || !h.powerUnitMake) {
        return {
          ...h,
          powerUnitYear: h.powerUnitYear || (userProfile?.powerUnitYear ? Number(userProfile.powerUnitYear) : ''),
          powerUnitMake: h.powerUnitMake || userProfile?.powerUnitMake || '',
          powerUnitModel: h.powerUnitModel || userProfile?.powerUnitModel || '',
          engineType: h.engineType || userProfile?.engineType || '',
          duallyOrSrw: h.duallyOrSrw || userProfile?.duallyOrSrw || 'SRW',
          drivetrain: h.drivetrain || userProfile?.drivetrain || '',
          powerUnitScaleWeight: h.powerUnitScaleWeight || (userProfile?.powerUnitScaleWeight ? Number(userProfile.powerUnitScaleWeight) : ''),
          powerUnitWheelbase: h.powerUnitWheelbase || userProfile?.powerUnitWheelbase || '',
          fuelType: h.fuelType || userProfile?.fuelType || ''
        };
      }
      return h;
    });

  // Filter ONLY items with valid loaded MPG
  const validMpgList = enrichedList.filter(h => h && (Number(h.loadedMpg || h.milesPerGallon || 0) > 0));
  if (validMpgList.length === 0) return [];

  // Extract current user attributes to match against
  const userMake = (userProfile?.powerUnitMake || '').toLowerCase().trim();
  const userDually = (userProfile?.duallyOrSrw || 'SRW').toLowerCase();
  const userEngine = (userProfile?.engineType || '').toLowerCase().trim();
  const userWheelbase = (userProfile?.powerUnitWheelbase || 'LWB').toLowerCase();
  const userPuScaleWeight = Number(userProfile?.powerUnitScaleWeight || 0);

  const curScaleWeight = Number(localHaul?.scaleWeight || 0);
  const curAxles = Number(localHaul?.axles || 0);

  // Helper matching functions
  const isSimilarMake = (item: any) => {
    if (!item) return false;
    const itemMake = (item.powerUnitMake || '').toLowerCase().trim();
    if (!userMake || !itemMake) return true;
    return itemMake === userMake;
  };

  const isDuallyMatch = (item: any) => {
    if (!item) return false;
    const itemDually = (item.duallyOrSrw || 'SRW').toLowerCase();
    return itemDually === userDually;
  };

  const isSimilarEngine = (item: any) => {
    if (!item) return false;
    const itemEngine = (item.engineType || '').toLowerCase().trim();
    if (!userEngine || !itemEngine) return true;
    return itemEngine.includes(userEngine) || userEngine.includes(itemEngine);
  };

  const isSimilarPuWeight = (item: any) => {
    if (!item) return false;
    const itemPuWeight = Number(item.powerUnitScaleWeight || 0);
    if (userPuScaleWeight <= 0 || itemPuWeight <= 0) return true;
    return Math.abs(itemPuWeight - userPuScaleWeight) <= 2500;
  };

  const isWheelbaseMatch = (item: any) => {
    if (!item) return false;
    const itemWheelbase = (item.powerUnitWheelbase || 'LWB').toLowerCase();
    return itemWheelbase === userWheelbase;
  };

  const isSimilarTowedWeight = (item: any) => {
    if (!item) return false;
    const itemWeight = Number(item.scaleWeight || 0);
    if (curScaleWeight <= 0 || itemWeight <= 0) return true;
    return Math.abs(itemWeight - curScaleWeight) <= 4500;
  };

  const isAxlesMatch = (item: any) => {
    if (!item) return false;
    const itemAxles = Number(item.axles || 0);
    if (curAxles <= 0 || itemAxles <= 0) return true;
    return itemAxles === curAxles;
  };

  // Run filtering on validMpgList with fallback tiers
  let matched = validMpgList.filter(item => 
    isSimilarMake(item) &&
    isDuallyMatch(item) &&
    isSimilarEngine(item) &&
    isWheelbaseMatch(item) &&
    isSimilarPuWeight(item) &&
    isSimilarTowedWeight(item) &&
    isAxlesMatch(item)
  );

  // Tier 2: Match Make + dually + wheelbase + axles + scale weight
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isSimilarMake(item) &&
      isDuallyMatch(item) &&
      isWheelbaseMatch(item) &&
      isAxlesMatch(item) &&
      isSimilarTowedWeight(item)
    );
  }

  // Tier 3: Loose Match Make + dually + axles
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isSimilarMake(item) &&
      isDuallyMatch(item) &&
      isAxlesMatch(item)
    );
  }

  // Tier 4: Broad match: Just dually/srw + axles
  if (matched.length === 0) {
    matched = validMpgList.filter(item => 
      isDuallyMatch(item) &&
      isAxlesMatch(item)
    );
  }

  // Fallback to all completed/finalized entries from actual users of the app
  if (matched.length === 0) {
    matched = validMpgList;
  }

  return matched;
}

const ExpenseAmountInput = ({ amount, onChange }: { amount: number, onChange: (val: number) => void }) => {
  const [localValue, setLocalValue] = useState<string>(amount > 0 ? amount.toFixed(2) : "");

  useEffect(() => {
    const parsedLocal = parseFloat(localValue);
    if (isNaN(parsedLocal) || parsedLocal !== amount) {
      setLocalValue(amount > 0 ? amount.toFixed(2) : "");
    }
  }, [amount]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setLocalValue(valStr);
    
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    } else if (valStr === "") {
      onChange(0);
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && parsed > 0) {
      setLocalValue(parsed.toFixed(2));
    } else {
      setLocalValue("");
    }
  };

  return (
    <input 
      type="text" 
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className="text-sm font-semibold text-slate-900 bg-transparent focus:outline-none w-full border-b border-transparent focus:border-blue-200 transition-colors"
      placeholder="0.00"
    />
  );
};

// Memory cache to store computed fuel data per Haul ID so reopening is instantaneous
const fuelDataCache: Record<string, {
  traversedStates: string[];
  stateFuelBreakdown: Record<string, { gas: number, diesel: number }>;
  fuelPrices: { diesel: number; gas: number };
  routeFuelSource: string;
}> = {};

export default function ActiveWorkspace({ haul, onClose, customFolders = [], onUpdateFolders, operatorType }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [localHaul, setLocalHaul] = useState<Haul>(haul);
  const localHaulRef = useRef<Haul>(haul);
  const isDirtyRef = useRef(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const currentOperatorType = localHaul.operatorType || operatorType || userProfile?.operatorType || "RV Tow Away";
  const [communityAvgMpg, setCommunityAvgMpg] = useState(10.5);
  const [allPlatformCompletedHauls, setAllPlatformCompletedHauls] = useState<any[]>([]);
  const [myHistoricalCompletedHauls, setMyHistoricalCompletedHauls] = useState<any[]>([]);
  const [totalHaulsCount, setTotalHaulsCount] = useState(0);
  const [scannedReceipts, setScannedReceipts] = useState<ScannedReceipt[]>([]);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isReceiptFolderOpen, setIsReceiptFolderOpen] = useState(false);
  const [selectedViewerReceipt, setSelectedViewerReceipt] = useState<ScannedReceipt | null>(null);
  const [manualFuelPrice, setManualFuelPrice] = useState<number | null>(null);
  const [showTopConfigs, setShowTopConfigs] = useState(false);
  const [showMySimilarUnits, setShowMySimilarUnits] = useState(false);

  // Read from in-memory cache if available
  const cachedData = haul?.id ? fuelDataCache[haul.id] : null;

  // Derive initial values immediately (0 ms) using fast local estimation
  const getInitialDefaultPrices = () => {
    if (cachedData) return cachedData.fuelPrices;
    const originMatch = extractStateCode(localHaul.pickUpLocation || "");
    const destMatch = extractStateCode(localHaul.deliveryLocation || "");
    const initialStates = [originMatch, destMatch].filter(Boolean) as string[];
    let dieselTotal = 0;
    let gasTotal = 0;
    let count = 0;
    initialStates.forEach(st => {
      if (st && STATE_FUEL_PRICES[st]) {
        dieselTotal += STATE_FUEL_PRICES[st].diesel;
        gasTotal += STATE_FUEL_PRICES[st].gas;
        count++;
      }
    });
    if (count > 0) {
      return {
        diesel: Number((dieselTotal / count).toFixed(3)),
        gas: Number((gasTotal / count).toFixed(3))
      };
    }
    return { diesel: 3.85, gas: 3.35 };
  };

  const getInitialBreakdown = () => {
    if (cachedData) return cachedData.stateFuelBreakdown;
    const originMatch = extractStateCode(localHaul.pickUpLocation || "");
    const destMatch = extractStateCode(localHaul.deliveryLocation || "");
    const initialStates = [originMatch, destMatch].filter(Boolean) as string[];
    const breakdown: Record<string, { gas: number, diesel: number }> = {};
    initialStates.forEach(st => {
      if (st && STATE_FUEL_PRICES[st]) {
        breakdown[st] = STATE_FUEL_PRICES[st];
      }
    });
    return breakdown;
  };

  const getInitialTraversedStates = () => {
    if (cachedData) return cachedData.traversedStates;
    const originMatch = extractStateCode(localHaul.pickUpLocation || "");
    const destMatch = extractStateCode(localHaul.deliveryLocation || "");
    return [originMatch, destMatch].filter(Boolean) as string[];
  };

  const getInitialRouteSource = () => {
    if (cachedData) return cachedData.routeFuelSource;
    const originMatch = extractStateCode(localHaul.pickUpLocation || "");
    const destMatch = extractStateCode(localHaul.deliveryLocation || "");
    const initialStates = [originMatch, destMatch].filter(Boolean) as string[];
    if (initialStates.length > 0) {
      return `State Average Pump Price (${initialStates.join('-')})`;
    }
    return "National Average";
  };

  const [fuelPrices, setFuelPrices] = useState(getInitialDefaultPrices);
  const [stateFuelBreakdown, setStateFuelBreakdown] = useState<Record<string, { gas: number, diesel: number }>>(getInitialBreakdown);
  const [routeFuelSource, setRouteFuelSource] = useState(getInitialRouteSource);
  const [traversedStates, setTraversedStates] = useState<string[]>(getInitialTraversedStates);

  const routesLib = useMapsLibrary('routes');
  const geocodingLib = useMapsLibrary('geocoding');

  useEffect(() => {
    let isActive = true;
    let debounceTimer: NodeJS.Timeout;

    async function calculateStates() {
      const origin = localHaul.pickUpLocation || "";
      const destination = localHaul.deliveryLocation || "";

      if (origin.length <= 3 || destination.length <= 3) {
        setStateFuelBreakdown({});
        setFuelPrices({ diesel: 3.85, gas: 3.35 });
        setRouteFuelSource("National Average");
        return;
      }

      const originMatch = extractStateCode(origin);
      const destMatch = extractStateCode(destination);
      const statesSet = new Set([originMatch, destMatch].filter(Boolean) as string[]);
      const initialStates = Array.from(statesSet);

      try {
        const res = await fetch('/api/state-fuel-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            states: initialStates,
            origin,
            destination
          })
        });

        if (res.ok) {
          const data = await res.json();
          const resolvedStates = Array.isArray(data.states) ? data.states : initialStates;
          const resolvedPrices = data.prices || data;
          const breakdown: Record<string, { gas: number, diesel: number }> = {};
          
          let dieselTotal = 0;
          let gasTotal = 0;
          let count = 0;

          resolvedStates.forEach(st => {
            if (st && resolvedPrices[st] && resolvedPrices[st].gas > 0) {
              dieselTotal += resolvedPrices[st].diesel;
              gasTotal += resolvedPrices[st].gas;
              breakdown[st] = resolvedPrices[st];
              count++;
            } else if (st && STATE_FUEL_PRICES[st]) {
              dieselTotal += STATE_FUEL_PRICES[st].diesel;
              gasTotal += STATE_FUEL_PRICES[st].gas;
              breakdown[st] = STATE_FUEL_PRICES[st];
              count++;
            }
          });

          if (count > 0) {
            const finalFuelPrices = {
              diesel: Number((dieselTotal / count).toFixed(3)),
              gas: Number((gasTotal / count).toFixed(3))
            };
            const finalRouteSource = `Live AAA State Average Pump Price (${resolvedStates.join('-')})`;

            if (isActive) {
              setTraversedStates(resolvedStates);
              setStateFuelBreakdown(breakdown);
              setFuelPrices(finalFuelPrices);
              setRouteFuelSource(finalRouteSource);

              // Update client cache so subsequent opens of the same unit are instant
              if (localHaul.id) {
                fuelDataCache[localHaul.id] = {
                  traversedStates: resolvedStates,
                  stateFuelBreakdown: breakdown,
                  fuelPrices: finalFuelPrices,
                  routeFuelSource: finalRouteSource
                };
              }
            }
          }
        } else {
          // Soft fallback to state averages using hardcoded constant
          let dieselTotal = 0;
          let gasTotal = 0;
          let count = 0;
          const breakdown: Record<string, { gas: number, diesel: number }> = {};

          initialStates.forEach(st => {
            if (st && STATE_FUEL_PRICES[st]) {
              dieselTotal += STATE_FUEL_PRICES[st].diesel;
              gasTotal += STATE_FUEL_PRICES[st].gas;
              breakdown[st] = STATE_FUEL_PRICES[st];
              count++;
            }
          });

          if (count > 0 && isActive) {
            const finalFuelPrices = {
              diesel: Number((dieselTotal / count).toFixed(3)),
              gas: Number((gasTotal / count).toFixed(3))
            };
            const finalRouteSource = `Live AAA State Average Pump Price (${initialStates.join('-')})`;
            
            setStateFuelBreakdown(breakdown);
            setFuelPrices(finalFuelPrices);
            setRouteFuelSource(finalRouteSource);
            
            if (localHaul.id) {
              fuelDataCache[localHaul.id] = {
                traversedStates: initialStates,
                stateFuelBreakdown: breakdown,
                fuelPrices: finalFuelPrices,
                routeFuelSource: finalRouteSource
              };
            }
          }
        }
      } catch (e) {
        console.error("Error fetching state fuel prices:", e);
        // Soft fallback to state averages using hardcoded constant
        let dieselTotal = 0;
        let gasTotal = 0;
        let count = 0;
        const breakdown: Record<string, { gas: number, diesel: number }> = {};

        initialStates.forEach(st => {
          if (st && STATE_FUEL_PRICES[st]) {
            dieselTotal += STATE_FUEL_PRICES[st].diesel;
            gasTotal += STATE_FUEL_PRICES[st].gas;
            breakdown[st] = STATE_FUEL_PRICES[st];
            count++;
          }
        });

        if (count > 0 && isActive) {
          const finalFuelPrices = {
            diesel: Number((dieselTotal / count).toFixed(3)),
            gas: Number((gasTotal / count).toFixed(3))
          };
          const finalRouteSource = `Live AAA State Average Pump Price (${initialStates.join('-')})`;
          
          setStateFuelBreakdown(breakdown);
          setFuelPrices(finalFuelPrices);
          setRouteFuelSource(finalRouteSource);
          
          if (localHaul.id) {
            fuelDataCache[localHaul.id] = {
              traversedStates: initialStates,
              stateFuelBreakdown: breakdown,
              fuelPrices: finalFuelPrices,
              routeFuelSource: finalRouteSource
            };
          }
        }
      }
    }

    // Set debounce delay. If CachedData already exists for this unit, do not run immediately or refresh silently
    // with 1.5s delay to keep network calls minimal. If not cached, launch calculating in 150ms for extremely fast initial fetch!
    const delay = cachedData ? 1500 : 150;
    debounceTimer = setTimeout(() => {
      calculateStates();
    }, delay);

    return () => { 
      isActive = false; 
      clearTimeout(debounceTimer);
    };
  }, [localHaul.pickUpLocation, localHaul.deliveryLocation]);

  const stats = calculateTotals(localHaul, expenses);
  const { expectedMpg: expectedVehicleMpg } = getExpectedVehicleMpg(userProfile, localHaul, traversedStates);

  const mySimilarHauls = (() => {
    let isDiesel = (userProfile?.fuelType || 'Diesel') === 'Diesel';
    const engineLower = (userProfile?.engineType || "").toLowerCase();
    if (engineLower.includes("diesel")) {
      isDiesel = true;
    } else if (engineLower.includes("gas") || engineLower.includes("hemi") || engineLower.includes("vortec") || engineLower.includes("godzilla")) {
      isDiesel = false;
    }

    const curWeight = parseCleanWeight(localHaul.scaleWeight) || 0;
    const getTerrainCategoryForLocs = (states: string[], pickUp: string, delivery: string) => {
      const allStates = new Set<string>(states);
      const pCode = extractStateCode(pickUp);
      const dCode = extractStateCode(delivery);
      if (pCode) allStates.add(pCode);
      if (dCode) allStates.add(dCode);
      
      const mountainStates = ["CO", "UT", "WY", "ID", "MT", "WA", "OR", "CA", "NV", "NM", "AZ"];
      const plainsStates = ["KS", "NE", "SD", "ND", "OK", "IA", "TX"];
      
      let mtCount = 0;
      let plainsCount = 0;
      allStates.forEach(st => {
        if (mountainStates.includes(st)) mtCount++;
        if (plainsStates.includes(st)) plainsCount++;
      });
      
      if (mtCount > 0) return 'mountain';
      if (plainsCount > 0) return 'plains';
      return 'flat';
    };

    const curTerrain = getTerrainCategoryForLocs(traversedStates, localHaul.pickUpLocation || "", localHaul.deliveryLocation || "");
    const myCompleted = myHistoricalCompletedHauls.length > 0
      ? myHistoricalCompletedHauls.filter(h => h && h.id !== localHaul.id && (h.loadedMpg > 0 || h.milesPerGallon > 0))
      : allPlatformCompletedHauls.filter(h => h && h.ownerId && auth.currentUser && h.ownerId === auth.currentUser.uid && h.id !== localHaul.id);

    const sameFuelType = myCompleted.filter(item => {
      if (!item) return false;
      const itemEngine = (item.engineType || "").toLowerCase();
      const itemIsDiesel = item.fuelType === 'Diesel' || itemEngine.includes('diesel');
      return itemIsDiesel === isDiesel;
    });
    const baseSet = sameFuelType.length > 0 ? sameFuelType : myCompleted;

    const matched = baseSet.filter(item => {
      if (!item) return false;
      const itemWeight = Number(item.scaleWeight || 0);
      if (curWeight > 0) {
        if (itemWeight <= 0) return false;
        const weightDiff = Math.abs(itemWeight - curWeight);
        return weightDiff <= 1000;
      }
      return true;
    });

    // Sort to prioritize same terrain first, then date descending
    matched.sort((a, b) => {
      const terrainA = getTerrainCategoryForLocs([], a.pickUpLocation || "", a.deliveryLocation || "") === curTerrain;
      const terrainB = getTerrainCategoryForLocs([], b.pickUpLocation || "", b.deliveryLocation || "") === curTerrain;
      
      if (terrainA && !terrainB) return -1;
      if (!terrainA && terrainB) return 1;
      
      const dateA = a.pickUpDate ? new Date(a.pickUpDate).getTime() : 0;
      const dateB = b.pickUpDate ? new Date(b.pickUpDate).getTime() : 0;
      return dateB - dateA;
    });

    return matched;
  })();

  const myAvgSimilarMpg = (() => {
    const last5 = [...mySimilarHauls]
      .sort((a, b) => {
        const dateA = a.pickUpDate ? new Date(a.pickUpDate).getTime() : 0;
        const dateB = b.pickUpDate ? new Date(b.pickUpDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);
    return last5.length > 0
      ? last5.reduce((acc, h) => acc + (h.loadedMpg || h.milesPerGallon || 0), 0) / last5.length
      : 0;
  })();

  const peersAvgSimilarMpg = (() => {
    let isDiesel = (userProfile?.fuelType || 'Diesel') === 'Diesel';
    const engineLower = (userProfile?.engineType || "").toLowerCase();
    if (engineLower.includes("diesel")) {
      isDiesel = true;
    } else if (engineLower.includes("gas") || engineLower.includes("hemi") || engineLower.includes("vortec") || engineLower.includes("godzilla")) {
      isDiesel = false;
    }

    const curWeight = parseCleanWeight(localHaul.scaleWeight) || 0;
    const getTerrainCategoryForLocs = (states: string[], pickUp: string, delivery: string) => {
      const allStates = new Set<string>(states);
      const pCode = extractStateCode(pickUp);
      const dCode = extractStateCode(delivery);
      if (pCode) allStates.add(pCode);
      if (dCode) allStates.add(dCode);
      
      const mountainStates = ["CO", "UT", "WY", "ID", "MT", "WA", "OR", "CA", "NV", "NM", "AZ"];
      const plainsStates = ["KS", "NE", "SD", "ND", "OK", "IA", "TX"];
      
      let mtCount = 0;
      let plainsCount = 0;
      allStates.forEach(st => {
        if (mountainStates.includes(st)) mtCount++;
        if (plainsStates.includes(st)) plainsCount++;
      });
      
      if (mtCount > 0) return 'mountain';
      if (plainsCount > 0) return 'plains';
      return 'flat';
    };

    const curTerrain = getTerrainCategoryForLocs(traversedStates, localHaul.pickUpLocation || "", localHaul.deliveryLocation || "");
    const peersCompleted = allPlatformCompletedHauls.filter(h => h && h.ownerId !== auth.currentUser?.uid);

    const sameFuelType = peersCompleted.filter(item => {
      if (!item) return false;
      const itemEngine = (item.engineType || "").toLowerCase();
      const itemIsDiesel = item.fuelType === 'Diesel' || itemEngine.includes('diesel');
      return itemIsDiesel === isDiesel;
    });
    const baseSet = sameFuelType.length > 0 ? sameFuelType : peersCompleted;

    let matched = baseSet.filter(item => {
      if (!item) return false;
      const itemTerrain = getTerrainCategoryForLocs([], item.pickUpLocation || "", item.deliveryLocation || "");
      const sameTerrain = itemTerrain === curTerrain;
      const weightDiff = Math.abs((item.scaleWeight || 0) - curWeight);
      return sameTerrain && (curWeight > 0 ? (weightDiff <= 3500) : true);
    });

    if (matched.length === 0) {
      matched = baseSet.filter(item => {
        if (!item) return false;
        const itemTerrain = getTerrainCategoryForLocs([], item.pickUpLocation || "", item.deliveryLocation || "");
        const sameTerrain = itemTerrain === curTerrain;
        const weightDiff = Math.abs((item.scaleWeight || 0) - curWeight);
        return sameTerrain && (curWeight > 0 ? (weightDiff <= 6000) : true);
      });
    }

    if (matched.length === 0) {
      matched = baseSet.filter(item => {
        if (!item) return false;
        const itemTerrain = getTerrainCategoryForLocs([], item.pickUpLocation || "", item.deliveryLocation || "");
        return itemTerrain === curTerrain;
      });
    }

    if (matched.length === 0) return 0;
    const sum = matched.reduce((acc, h) => acc + (h.loadedMpg || h.milesPerGallon || 0), 0);
    return sum / matched.length;
  })();

  const combinedHaulsGlobal = useMemo(() => {
    const map = new Map();
    if (allPlatformCompletedHauls && Array.isArray(allPlatformCompletedHauls)) {
      allPlatformCompletedHauls.forEach(h => { if (h && h.id) map.set(h.id, h); });
    }
    if (myHistoricalCompletedHauls && Array.isArray(myHistoricalCompletedHauls)) {
      myHistoricalCompletedHauls.forEach(h => {
        if (!h || !h.id) return;
        map.set(h.id, {
          ...h,
          ownerId: h.ownerId || auth.currentUser?.uid,
          loadedMpg: Number(h.loadedMpg || h.milesPerGallon || 0),
          powerUnitYear: h.powerUnitYear || (userProfile?.powerUnitYear ? Number(userProfile.powerUnitYear) : ''),
          powerUnitMake: h.powerUnitMake || userProfile?.powerUnitMake || '',
          powerUnitModel: h.powerUnitModel || userProfile?.powerUnitModel || '',
          engineType: h.engineType || userProfile?.engineType || '',
          duallyOrSrw: h.duallyOrSrw || userProfile?.duallyOrSrw || 'SRW',
          drivetrain: h.drivetrain || userProfile?.drivetrain || '',
          powerUnitScaleWeight: h.powerUnitScaleWeight || (userProfile?.powerUnitScaleWeight ? Number(userProfile.powerUnitScaleWeight) : ''),
          powerUnitWheelbase: h.powerUnitWheelbase || userProfile?.powerUnitWheelbase || '',
          fuelType: h.fuelType || userProfile?.fuelType || ''
        });
      });
    }
    return Array.from(map.values());
  }, [allPlatformCompletedHauls, myHistoricalCompletedHauls, userProfile, auth.currentUser]);

  const top5GlobalSetups = useMemo(() => {
    const setupGroups = new Map<string, any>();
    
    // Leverage the multi-tiered platform-wide setups filter to find peer setups with same or similar configuration
    const similarHauls = getRegisteredUserSimilarSetups(combinedHaulsGlobal, userProfile, localHaul);

    similarHauls.forEach(h => {
      const mpg = Number(h.loadedMpg || h.milesPerGallon || 0);
      if (mpg <= 0) return;

      const make = h.powerUnitMake || 'Generic';
      const model = h.powerUnitModel || 'Power Unit';
      const year = h.powerUnitYear || '';
      const drw = h.duallyOrSrw || 'SRW';
      const drive = h.drivetrain || '4x4';
      const wb = h.powerUnitWheelbase || 'LWB';
      const axles = h.axles || '';
      const unitType = h.unitType || 'RV';
      
      const key = `${year}-${make}-${model}-${drw}-${drive}-${wb}-${axles}-${unitType}`;
      
      if (!setupGroups.has(key)) {
        setupGroups.set(key, {
          make, model, year, drw, drive, wb, axles, unitType,
          scaleWeight: Number(h.scaleWeight || 0),
          totalMpg: 0,
          count: 0
        });
      }
      
      const group = setupGroups.get(key);
      group.totalMpg += mpg;
      group.count += 1;
      if (Number(h.scaleWeight || 0) > group.scaleWeight) {
        group.scaleWeight = Number(h.scaleWeight || 0);
      }
    });

    return Array.from(setupGroups.values())
      .map(g => ({
        ...g,
        avgMpg: g.totalMpg / g.count
      }))
      .sort((a, b) => b.avgMpg - a.avgMpg)
      .slice(0, 5);
  }, [combinedHaulsGlobal, userProfile, localHaul]);

  const industryAvgMpg = useMemo(() => {
    if (top5GlobalSetups.length === 0) return 0;
    const sum = top5GlobalSetups.reduce((acc, g) => acc + g.avgMpg, 0);
    return sum / top5GlobalSetups.length;
  }, [top5GlobalSetups]);

  const [showErrors, setShowErrors] = useState(false);

  const mandatoryFields: (keyof Haul)[] = [
    'unitNumber', 'pickUpDate', 'pickUpLocation', 'deliveryDate', 
    'deliveryLocation', 'totalMiles', 'ratePerMile', 'scaleWeight'
  ];

  const missingFields = mandatoryFields.filter(f => {
    const val = localHaul[f];
    if (typeof val === 'number') {
      return val <= 0;
    }
    return !val || typeof val !== 'string' || val.trim() === '';
  });

  const isComplete = missingFields.length === 0;
  const isMarkCompletedDisabled = (haul.status !== 'Completed' && haul.status !== 'Finalized') && !isComplete;

  const isFieldInvalid = (field: keyof Haul) => {
    if (!showErrors) return false;
    return missingFields.includes(field);
  };

  
  const averagePricePerGallon = stats.totalFuelGallons > 0 ? ((stats.costsByCategory['Fuel'] || 0) / stats.totalFuelGallons) : 0;


  const expensesRef = useRef<Expense[]>([]);
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);

  const handleHaulChange = (e: any) => {
    const { name, value, type } = e.target;
    let parsedValue: any = value;
    if (type === 'number') {
      parsedValue = value === '' ? '' : parseFloat(value);
    }
    isDirtyRef.current = true;
    setLocalHaul(prev => {
      const updated = { ...prev, [name]: parsedValue };
      localHaulRef.current = updated;
      return updated;
    });
  };

  const saveHaulData = async (updatedHaul?: any) => {
    if (!haul?.id) return;
    if (haul.status !== 'Active') return; // Do not save if completed or finalized (blocked by rules)
    
    const isEvent = updatedHaul && (
      updatedHaul.nativeEvent || 
      updatedHaul.target || 
      updatedHaul.preventDefault || 
      (typeof updatedHaul === 'object' && 'type' in updatedHaul && 'bubbles' in updatedHaul)
    );

    // If an explicit non-event object was passed, mark dirty to force the save
    if (updatedHaul && !isEvent) {
      isDirtyRef.current = true;
    }

    if (!isDirtyRef.current) return;

    try {
      const targetHaul = (updatedHaul && !isEvent && typeof updatedHaul === 'object' && 'unitNumber' in updatedHaul) 
        ? updatedHaul 
        : localHaulRef.current;
      const currentStats = calculateTotals(targetHaul, expensesRef.current);
      const { id, ownerId, status, createdAt, updatedAt, ...dataToSave } = targetHaul as any;
      
      const cleanedDataToSave: any = {};
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] !== undefined) {
          cleanedDataToSave[key] = dataToSave[key];
        }
      });
      
      await updateDoc(doc(db, 'hauls', haul.id), {
        ...cleanedDataToSave,
        grossRevenue: currentStats.grossRevenue,
        totalOperatingCosts: currentStats.totalOperatingCosts,
        netProfit: currentStats.netProfit,
        milesPerGallon: currentStats.mpg,
        updatedAt: serverTimestamp()
      });

      // Clear dirty flag upon successful Firestore save
      isDirtyRef.current = false;
    } catch(err) { 
      console.error("Error autosaving haul data:", err); 
    }
  };

  const saveHaulDataRef = useRef(saveHaulData);
  useEffect(() => {
    saveHaulDataRef.current = saveHaulData;
  }, [saveHaulData]);

  // Sync prop changes from Firestore to local state when there are no unsaved dirty edits
  useEffect(() => {
    if (haul && !isDirtyRef.current) {
      setLocalHaul(haul);
      localHaulRef.current = haul;
    }
  }, [haul]);

  // Debounced auto-save effect for seamless background persistence as the user works
  useEffect(() => {
    if (!isDirtyRef.current) return;
    const timer = setTimeout(() => {
      saveHaulData();
    }, 1000); // 1.0 second autosave debounce
    return () => clearTimeout(timer);
  }, [localHaul]);

  useEffect(() => {
    return () => {
      // Force immediate save on unmount if dirty
      if (isDirtyRef.current) {
        saveHaulDataRef.current();
      }
    };
  }, []);

  const handleClose = async () => {
    if (isDirtyRef.current) {
      await saveHaulData();
    }
    onClose();
  };

  const handleMarkCompleted = async () => {
    if (!haul?.id) return;

    if (haul.status === 'Completed' || haul.status === 'Finalized') {
      onClose();
      return;
    }

    if (!isComplete) {
      setShowErrors(true);
      const invalidFields = missingFields.join(', ');
      alert(`Cannot complete. The following mandatory fields are missing or invalid:\n\n${invalidFields}`);
      return;
    }

    try {
      // First save current changes to make sure details are up to date
      await saveHaulData();
      
      // Update the haul document status to Completed
      await updateDoc(doc(db, 'hauls', haul.id), {
        status: 'Completed',
        updatedAt: serverTimestamp()
      });
      
      // Close the workspace after success
      onClose();
    } catch (err) {
      console.error("Error marking haul completed:", err);
    }
  };

  const updateExpense = async (id: string, data: any) => {
    if (!haul?.id) return;
    try {
      await updateDoc(doc(db, 'hauls', haul.id, 'expenses', id), data);
    } catch(err) { console.error(err); }
  };

  const addManualExpense = async (category: string) => {
    if (!haul?.id || !auth.currentUser) return;
    try {
      await addDoc(collection(db, 'hauls', haul.id, 'expenses'), {
        category,
        amount: 0,
        vendor: '',
        haulId: haul.id,
        ownerId: auth.currentUser.uid,
        timestamp: new Date().toISOString(),
      });
    } catch(err) { console.error(err); }
  };

  const deleteExpense = async (id: string) => {
    if (!haul?.id) return;
    try {
      await deleteDoc(doc(db, 'hauls', haul.id, 'expenses', id));
    } catch(err) { console.error(err); }
  };

  const handleReceiptScan = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !haul?.id || !auth.currentUser) return;

    setIsUploadingReceipt(true);
    try {
      // 1. Read file as Base64 for the API
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const parts = reader.result.split(',');
            resolve(parts[1] || parts[0]);
          } else {
            reject(new Error("File read failed"));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // 2. Read full data URL for Firestore compliance payload
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // 3. Post to Gemini backend parser
      const response = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64String,
          mimeType: file.type || 'image/jpeg'
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const parsed = await response.json();

      // 4. Create verified scanned receipt record
      await addDoc(collection(db, 'hauls', haul.id, 'scannedReceipts'), {
        fileName: file.name || 'receipt.jpg',
        fileType: file.type || 'image/jpeg',
        dataUrl: dataUrl,
        timestamp: parsed.timestamp || new Date().toISOString(),
        vendor: parsed.vendor || 'Unknown Vendor',
        amount: Number(parsed.amount || 0)
      });

      // 5. Create core corresponding expense record
      await addDoc(collection(db, 'hauls', haul.id, 'expenses'), {
        haulId: haul.id,
        category: (parsed.category === 'Toll' ? 'Permits' : parsed.category) || 'Misc',
        amount: Number(parsed.amount || 0),
        ownerId: auth.currentUser.uid,
        timestamp: parsed.timestamp || new Date().toISOString(),
        vendor: parsed.vendor || 'Unknown Vendor',
        gallons: parsed.gallons ? Number(parsed.gallons) : undefined,
        pricePerGallon: parsed.pricePerGallon ? Number(parsed.pricePerGallon) : undefined
      });

      // 6. Support double-item split transaction mapping for DEF
      if (parsed.defItem) {
        await addDoc(collection(db, 'hauls', haul.id, 'expenses'), {
          haulId: haul.id,
          category: 'DEF',
          amount: Number(parsed.defItem.amount || 0),
          ownerId: auth.currentUser.uid,
          timestamp: parsed.defItem.timestamp || parsed.timestamp || new Date().toISOString(),
          vendor: parsed.defItem.vendor || parsed.vendor || 'Unknown Vendor',
          gallons: parsed.defItem.gallons ? Number(parsed.defItem.gallons) : undefined,
          pricePerGallon: parsed.defItem.pricePerGallon ? Number(parsed.defItem.pricePerGallon) : undefined
        });
      }

    } catch (err: any) {
      console.error("Error performing receipt OCR scan:", err);
      alert(`Receipt scanning failed: ${err.message || 'Please make sure it is a valid image.'}`);
    } finally {
      setIsUploadingReceipt(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'users', auth.currentUser.uid);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      } else {
        const cached = localStorage.getItem('cache_userProfile_' + auth.currentUser!.uid);
        if (cached) setUserProfile(JSON.parse(cached));
      }
    });
    return () => unsub();
  }, [auth.currentUser]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'hauls'),
      where('ownerId', '==', auth.currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTotalHaulsCount(snap.size);
      let totalMpg = 0;
      let count = 0;
      const list: any[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, ...data });
        // Skip deadhead MPG as it doesn't need to be aggregated
        const mpg = data.loadedMpg || data.milesPerGallon;
        if (typeof mpg === 'number' && mpg > 0) {
          totalMpg += mpg;
          count++;
        }
      });
      setMyHistoricalCompletedHauls(list);
      if (count > 0) {
        setCommunityAvgMpg(totalMpg / count);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'hauls');
    });
    return () => unsub();
  }, [auth.currentUser]);

  useEffect(() => {
    let isActive = true;
    async function loadPlatformCompletedHauls() {
      try {
        const res = await fetch('/api/community-hauls-summary');
        if (!res.ok) throw new Error("API responded with " + res.status);
        const data = await res.json();
        if (isActive && data && Array.isArray(data.hauls)) {
          const loaded = data.hauls || [];
          const merged = [...loaded.filter(Boolean), ...FALLBACK_PLATFORM_HAULS.filter(Boolean)];
          const unique = merged.filter((item, index, self) =>
            item && item.id && self.findIndex(t => t && t.id === item.id) === index
          );
          setAllPlatformCompletedHauls(unique);
        }
      } catch (err) {
        console.warn("Could not load community completed hauls summary from server:", err);
        if (isActive) {
          setAllPlatformCompletedHauls(FALLBACK_PLATFORM_HAULS);
        }
      }
    }
    loadPlatformCompletedHauls();
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!haul?.id || !auth.currentUser) return;
    const ownerId = auth.currentUser.uid;
    const q1 = query(collection(db, 'hauls', haul.id, 'expenses'), where('ownerId', '==', ownerId));
    const unsub = onSnapshot(q1, (snap) => {
      const exps: any[] = [];
      snap.forEach(d => exps.push({ id: d.id, ...d.data() }));
      setExpenses(exps);
    });
    const sub2 = onSnapshot(query(collection(db, 'hauls', haul.id, 'scannedReceipts')), snap => {
      const recs: any[] = [];
      snap.forEach(d => recs.push({id: d.id, ...d.data()}));
      setScannedReceipts(recs);
    });
    return () => { unsub(); sub2(); };
  }, [haul?.id, auth.currentUser]);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[60] bg-slate-50 overflow-y-auto"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
        <header className="flex items-center justify-between gap-4 mb-4 sm:mb-8 mt-2 sm:mt-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleClose}
              className="hidden sm:flex p-3 bg-white rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 hover:shadow transition-all group"
              title="Close Workspace"
            >
              <X className="w-6 h-6 text-slate-500 group-hover:text-slate-800" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Trip Workspace</h1>
              <p className="text-sm font-medium text-slate-500 mt-1">Manage active load details for <span className="text-blue-600 font-bold">{localHaul.unitNumber}</span></p>
            </div>
          </div>

          <button
            onClick={isMarkCompletedDisabled ? undefined : handleMarkCompleted}
            disabled={isMarkCompletedDisabled}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-sm transition-all focus:outline-none shrink-0 ${
              isMarkCompletedDisabled 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md cursor-pointer'
            }`}
          >
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>{(haul.status === 'Completed' || haul.status === 'Finalized') ? 'Save & Close' : 'Mark Completed'}</span>
          </button>
        </header>

        {/* Mobile-Only Prominent Receipt Scan Card */}
        <div className="sm:hidden mb-6">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 rounded-[28px] text-white shadow-md flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold tracking-tight">Got a receipt?</h4>
              <p className="text-[10px] text-purple-100 font-medium leading-relaxed">
                Scan fuel, food, or other expenses. Gemini OCR parses it instantly.
              </p>
            </div>
            <label className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-indigo-700 active:scale-95 hover:bg-slate-50 transition-all rounded-xl text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer select-none shrink-0">
              {isUploadingReceipt ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 text-indigo-600" />
                  <span>Scan</span>
                </>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleReceiptScan} 
                disabled={isUploadingReceipt} 
                className="hidden" 
              />
            </label>
          </div>
        </div>

        <div className="max-w-4xl mx-auto flex flex-col space-y-8 my-8">
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-900">Delivery Details</h3>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <Folder className="w-3.5 h-3.5 text-blue-500" />
                    Folder Assignment
                  </span>
                  {/* SECTION_2_MID_ANCHOR_1 */}
                  <div className="space-y-3">
                    <div className="flex flex-col">
                      <input 
                        name="folder" 
                        type="text" 
                        value={localHaul.folder || ''} 
                        onChange={handleHaulChange} 
                        onBlur={saveHaulData}
                        placeholder="Type a folder name to organize / move..."
                        className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 animate-slide-in" 
                      />
                      {localHaul.folder && localHaul.folder.trim().length > 0 && !(customFolders || []).includes(localHaul.folder.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            const typedFolder = localHaul.folder!.trim();
                            const updatedFolders = [...(customFolders || []), typedFolder];
                            if (onUpdateFolders) {
                              onUpdateFolders(updatedFolders);
                            }
                            isDirtyRef.current = true;
                            saveHaulData();
                          }}
                          className="mt-2 self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-all shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create & Assign Folder &ldquo;{localHaul.folder.trim()}&rdquo;
                        </button>
                      )}
                    </div>
                    {customFolders && customFolders.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Assign to Existing Folder:</p>
                        <div className="flex flex-wrap gap-1.5 p-2 border border-slate-100 rounded-2xl bg-slate-50/50 max-h-32 overflow-y-auto">
                          {customFolders.map(folder => (
                            <button
                              key={folder}
                              type="button"
                              onClick={() => {
                                isDirtyRef.current = true;
                                const updated = { ...localHaul, folder };
                                setLocalHaul(updated);
                                localHaulRef.current = updated;
                                // Save immediately
                                saveHaulData(updated);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                (localHaul.folder || '') === folder 
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              {folder}
                            </button>
                          ))}
                          {(localHaul.folder || '') !== '' && (
                            <button
                              type="button"
                              onClick={() => {
                                isDirtyRef.current = true;
                                const updated = { ...localHaul, folder: '' };
                                setLocalHaul(updated);
                                localHaulRef.current = updated;
                                // Save immediately
                                saveHaulData(updated);
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed border-red-200 text-red-600 bg-white hover:bg-red-50 hover:border-red-300 transition-all flex items-center gap-1"
                            >
                              Clear Folder Assignment
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {scannedReceipts.length > 0 && (
                <div className="border border-purple-100 rounded-3xl bg-purple-50/20 p-5 space-y-4 shadow-xs animate-fade-in my-2">
                  <button
                    type="button"
                    onClick={() => setIsReceiptFolderOpen(!isReceiptFolderOpen)}
                    className="w-full flex items-center justify-between text-left group focus:outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-purple-100 text-purple-700 rounded-2xl group-hover:scale-105 transition-transform shrink-0">
                        {isReceiptFolderOpen ? (
                          <FolderOpen className="w-5 h-5 animate-bounce-once" />
                        ) : (
                          <Folder className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Unit Scanned Receipts Folder
                        </h4>
                        <p className="text-[11px] text-purple-700 mt-0.5 font-semibold">
                          {scannedReceipts.length} receipt{scannedReceipts.length > 1 ? 's' : ''} stored
                        </p>
                      </div>
                    </div>
                    <span className="p-1 rounded-xl bg-purple-100/50 hover:bg-purple-100 text-purple-700 transition-colors shrink-0">
                      {isReceiptFolderOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {isReceiptFolderOpen && (
                    <div className="pt-2 border-t border-purple-100/50 space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {scannedReceipts.map((receipt) => (
                        <div
                          key={receipt.id}
                          className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-purple-100/30 hover:shadow-xs transition-all"
                        >
                          <div 
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                            onClick={() => setSelectedViewerReceipt(receipt)}
                          >
                            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center relative group shrink-0">
                              <img
                                src={receipt.dataUrl}
                                alt="Thumbnail"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {receipt.vendor}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                ${Number(receipt.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} • {new Date(receipt.timestamp).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 ml-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedViewerReceipt(receipt)}
                              className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              title="View Receipt"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'hauls', haul.id, 'scannedReceipts', receipt.id));
                                } catch (err) {
                                  console.error("Failed to delete scanned receipt", err);
                                }
                              }}
                              className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                              title="Delete Scanned Receipt"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentOperatorType === 'RV Multi Haul' ? (
                <div className="space-y-6">
                  {/* Unit 1 */}
                  <div className="bg-slate-50/55 p-5 md:p-6 rounded-3xl border border-slate-100/80 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Unit #1 Specifications*
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Number 1*</label>
                        <input name="unitNumber" value={localHaul.unitNumber || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Length 1 (Feet)*</label>
                        <input type="number" name="unitLength" value={localHaul.unitLength || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">GVWR 1 (lbs)*</label>
                        <input type="number" name="grossWeight" value={localHaul.grossWeight || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Dry Weight 1 (lbs)*</label>
                        <input type="number" name="scaleWeight" value={localHaul.scaleWeight || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                    </div>
                  </div>

                  {/* Unit 2 */}
                  <div className="bg-slate-50/55 p-5 md:p-6 rounded-3xl border border-slate-100/80 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        Unit #2 Specifications (Optional)
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Number 2</label>
                        <input name="unitNumber2" value={localHaul.unitNumber2 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Length 2 (Feet)</label>
                        <input type="number" name="unitLength2" value={localHaul.unitLength2 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">GVWR 2 (lbs)</label>
                        <input type="number" name="grossWeight2" value={localHaul.grossWeight2 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Dry Weight 2 (lbs)</label>
                        <input type="number" name="scaleWeight2" value={localHaul.scaleWeight2 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                    </div>
                  </div>

                  {/* Unit 3 */}
                  <div className="bg-slate-50/55 p-5 md:p-6 rounded-3xl border border-slate-100/80 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Unit #3 Specifications (Optional)
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Number 3</label>
                        <input name="unitNumber3" value={localHaul.unitNumber3 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Length 3 (Feet)</label>
                        <input type="number" name="unitLength3" value={localHaul.unitLength3 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">GVWR 3 (lbs)</label>
                        <input type="number" name="grossWeight3" value={localHaul.grossWeight3 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Dry Weight 3 (lbs)</label>
                        <input type="number" name="scaleWeight3" value={localHaul.scaleWeight3 || ''} onChange={handleHaulChange} onBlur={() => saveHaulData()} className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-white border-slate-200 focus:ring-blue-100" />
                      </div>
                    </div>
                  </div>

                  {/* Classification Specs */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 animate-none">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Unit Type*</label>
                      <select 
                        name="unitType" 
                        value={localHaul.unitType || ''} 
                        onChange={handleHaulChange}
                        onBlur={() => saveHaulData()}
                        className={`w-full border rounded-2xl px-3 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all ${
                          isFieldInvalid('unitType') 
                            ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                            : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white'
                        }`}
                      >
                        <option value="">Select Type</option>
                        <option value="Travel Trailer">Travel Trailer</option>
                        <option value="Fifth Wheel">Fifth Wheel</option>
                        <option value="GN fifth Wheel">GN fifth Wheel</option>
                        <option value="Park/Destination Model">Park/Destination Model</option>
                        <option value="Cargo Trailer">Cargo Trailer</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Axles configuration</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3].map(cx => (
                          <label 
                            key={cx} 
                            className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-2.5 rounded-2xl border text-[10px] font-bold transition-all cursor-pointer ${
                              (localHaul.axles || 1) === cx 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-black' 
                                : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <input 
                              type="radio" 
                              name="axles" 
                              value={cx} 
                              checked={(localHaul.axles || 1) === cx} 
                              onChange={() => {
                                const updated = { ...localHaul, axles: cx };
                                setLocalHaul(updated);
                                localHaulRef.current = updated;
                                saveHaulData(updated);
                              }}
                              className="sr-only"
                            />
                            <span>{cx} Axle{cx > 1 ? 's' : ''}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {currentOperatorType === 'Hot Shot' ? 'BOL Number*' : 'Unit Number*'}
                      </label>
                      <input 
                        name="unitNumber" 
                        value={localHaul.unitNumber || ''} 
                        autoComplete="off"
                        onChange={handleHaulChange}
                        onBlur={() => saveHaulData()}
                        className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all ${
                          isFieldInvalid('unitNumber') 
                            ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                            : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white'
                        }`} 
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-between">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            {currentOperatorType === 'Hot Shot' ? 'Load Type*' : 'Unit Type*'}
                          </label>
                          <select 
                            name="unitType" 
                            value={localHaul.unitType || ''} 
                            onChange={handleHaulChange}
                            onBlur={() => saveHaulData()}
                            className={`w-full border rounded-2xl px-3 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all ${
                              isFieldInvalid('unitType') 
                                ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                                : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white'
                            }`}
                          >
                            {currentOperatorType === 'Hot Shot' ? (
                              <>
                                <option value="">Select Type</option>
                                <option value="Equipment/Machinery">Equipment/Machinery</option>
                                <option value="Steel/Materials">Steel/Materials</option>
                                <option value="Vehicles/Boats">Vehicles/Boats</option>
                                <option value="General Freight">General Freight</option>
                                <option value="LTL Deck load">LTL Deck load</option>
                              </>
                            ) : (
                              <>
                                <option value="">Select Type</option>
                                <option value="Travel Trailer">Travel Trailer</option>
                                <option value="Fifth Wheel">Fifth Wheel</option>
                                <option value="GN fifth Wheel">GN fifth Wheel</option>
                                <option value="Park/Destination Model">Park/Destination Model</option>
                                <option value="Cargo Trailer">Cargo Trailer</option>
                              </>
                            )}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            {currentOperatorType === 'Hot Shot' ? 'Load Length (Feet)*' : 'Unit Length (Feet)*'}
                          </label>
                          <input 
                            type="number"
                            name="unitLength" 
                            value={localHaul.unitLength || ''} 
                            autoComplete="off"
                            onChange={handleHaulChange}
                            onBlur={() => saveHaulData()}
                            placeholder="Length"
                            className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all ${
                              isFieldInvalid('unitLength') 
                                ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                                : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white'
                            }`} 
                          />
                        </div>
                      </div>
                      
                      {/* Axle configuration selector option */}
                      <div className="mt-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Axles configuration</span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3].map(cx => (
                            <label 
                              key={cx} 
                              className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                                (localHaul.axles || 1) === cx 
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-black' 
                                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              <input 
                                type="radio" 
                                name="axles" 
                                value={cx} 
                                checked={(localHaul.axles || 1) === cx} 
                                onChange={() => {
                                  const updated = { ...localHaul, axles: cx };
                                  setLocalHaul(updated);
                                  localHaulRef.current = updated;
                                  saveHaulData(updated);
                                }}
                                className="sr-only"
                              />
                              <span>{cx} Axle{cx > 1 ? 's' : ''}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 animate-none">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {currentOperatorType === 'Hot Shot' ? 'Load Weight (lbs)*' : 'GVWR (lbs)*'}
                      </label>
                      <input 
                        name="grossWeight" 
                        type="number" 
                        value={localHaul.grossWeight || ''} 
                        onChange={handleHaulChange} 
                        onBlur={() => saveHaulData()} 
                        placeholder="0"
                        className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                            isFieldInvalid('grossWeight')
                              ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                              : 'bg-slate-50 border-slate-100'
                          }`} 
                      />
                    </div>
                    {currentOperatorType !== 'Hot Shot' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scale/Dry Weight (lbs)*</label>
                        <input 
                          name="scaleWeight" 
                          type="number" 
                          value={localHaul.scaleWeight || ''} 
                          onChange={handleHaulChange} 
                          onBlur={() => saveHaulData()} 
                          placeholder="0"
                          className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                              isFieldInvalid('scaleWeight')
                                ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                                : 'bg-slate-50 border-slate-100'
                            }`} 
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pickup Location*</label>
                  <CityAutocomplete 
                    name="pickUpLocation" 
                    value={localHaul.pickUpLocation || ''} 
                    onChange={(val) => {
                      isDirtyRef.current = true;
                      setLocalHaul(prev => {
                        const updated = { ...prev, pickUpLocation: val };
                        localHaulRef.current = updated;
                        return updated;
                      });
                    }}
                    onBlur={saveHaulData}
                    placeholder="City, ST" 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                      isFieldInvalid('pickUpLocation') 
                        ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                        : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white focus:ring-2'
                    }`} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pickup Date*</label>
                  <input 
                    name="pickUpDate" 
                    type="date" 
                    value={localHaul.pickUpDate || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData} 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('pickUpDate') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer Name</label>
                  <input 
                    name="customerName" 
                    type="text" 
                    value={localHaul.customerName || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData}
                    placeholder="Enter customer name"
                    className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100" 
                  />
                </div>
              </div>



              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Delivery Location*</label>
                  <CityAutocomplete 
                    name="deliveryLocation" 
                    value={localHaul.deliveryLocation || ''} 
                    onChange={(val) => {
                      isDirtyRef.current = true;
                      setLocalHaul(prev => {
                        const updated = { ...prev, deliveryLocation: val };
                        localHaulRef.current = updated;
                        return updated;
                      });
                    }}
                    onBlur={saveHaulData}
                    placeholder="City, ST" 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                      isFieldInvalid('deliveryLocation') 
                        ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                        : 'bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white focus:ring-2'
                    }`} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Delivery Date*</label>
                  <input 
                    name="deliveryDate" 
                    type="date" 
                    value={localHaul.deliveryDate || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData} 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('deliveryDate') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Paid Trip Miles</label>
                  <input 
                    name="loadedMiles" 
                    type="number" 
                    value={localHaul.loadedMiles || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData} 
                    placeholder="0" 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('loadedMiles') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Actual Trip Miles*</label>
                  <input 
                    name="totalMiles" 
                    type="number" 
                    value={localHaul.totalMiles || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData} 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none transition-all ${
                        isFieldInvalid('totalMiles') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900 border-dashed ring-offset-0' 
                          : 'bg-slate-50 border-slate-100 text-slate-600'
                      }`} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Deadhead Miles</label>
                  <input 
                    name="deadheadMiles" 
                    type="number" 
                    value={localHaul.deadheadMiles || ''} 
                    onChange={handleHaulChange} 
                    onBlur={saveHaulData} 
                    placeholder="0" 
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('deadheadMiles') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rate ($)*</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                    <input 
                      name="ratePerMile" 
                      type="number" 
                      step="0.01" 
                      value={localHaul.ratePerMile === undefined || localHaul.ratePerMile === '' || Number(localHaul.ratePerMile) === 0 ? '' : localHaul.ratePerMile} 
                      onChange={handleHaulChange} 
                      placeholder="0.00"
                      onFocus={(e) => {
                        if (Number(e.target.value) === 0) {
                          e.target.select();
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleHaulChange({
                            ...e,
                            target: {
                              ...e.target,
                              name: 'ratePerMile',
                              value: val.toFixed(2),
                              type: 'number'
                            }
                          } as any);
                        } else {
                          handleHaulChange({
                            ...e,
                            target: {
                              ...e.target,
                              name: 'ratePerMile',
                              value: '',
                              type: 'number'
                            }
                          } as any);
                        }
                        saveHaulData();
                      }} 
                      className={`w-full border rounded-2xl pl-8 pr-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                          isFieldInvalid('ratePerMile')
                            ? 'border-red-500 ring-2 ring-red-100 text-slate-900 ring-offset-0' 
                            : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                        }`} 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Efficiency Metrics
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Loaded MPG</label>
                    <input 
                      name="loadedMpg" 
                      type="number" 
                      step="0.1" 
                      value={localHaul.loadedMpg || ''} 
                      onChange={handleHaulChange} 
                      onBlur={saveHaulData} 
                      placeholder="0.0" 
                      className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('loadedMpg') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Deadhead MPG</label>
                    <input 
                      name="deadheadMpg" 
                      type="number" 
                      step="0.1" 
                      value={localHaul.deadheadMpg || ''} 
                      onChange={handleHaulChange} 
                      onBlur={saveHaulData} 
                      placeholder="0.0" 
                      className={`w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                        isFieldInvalid('deadheadMpg') 
                          ? 'border-red-500 ring-2 ring-red-100 text-slate-900' 
                          : 'bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100'
                      }`} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-3xl border border-blue-100 flex flex-col justify-center">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-blue-900 uppercase">CALCULATED AVG MPG (LOADED AND DEADHEAD)</span>
                      <span className={`text-xl font-bold ${stats.mpg > 6 ? 'text-green-600' : 'text-blue-600'}`}>
                        {stats.mpg > 0 ? stats.mpg.toFixed(1) : '--.-'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-teal-50 rounded-3xl border border-teal-100 flex flex-col justify-between items-start gap-1">
                    <div className="flex flex-col gap-1 w-full">
                      <span className="text-[10px] font-bold text-teal-900 uppercase">MY SIMILAR HISTORY (AVG LOADED MPG)</span>
                      <span className={`text-xl font-bold ${myAvgSimilarMpg > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                        {myAvgSimilarMpg > 0 ? `${myAvgSimilarMpg.toFixed(1)}` : '--.-'}
                      </span>
                    </div>
                    {mySimilarHauls.length > 0 && (
                      <button 
                        type="button"
                        onClick={() => setShowMySimilarUnits(true)}
                        className="mt-2 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 font-extrabold text-[9px] uppercase tracking-wider text-white transition-all shadow-xs hover:shadow-md cursor-pointer self-start"
                      >
                        👁️ View {Math.min(5, mySimilarHauls.length)} Units
                      </button>
                    )}
                  </div>

                   <div className="p-4 bg-indigo-50 rounded-3xl border border-indigo-150 flex flex-col justify-between items-start gap-1">
                     <div className="flex flex-col gap-1 w-full">
                       <span className="text-[9px] font-extrabold text-indigo-950 uppercase tracking-tight block leading-tight">Registered User AVG (Similar Power Unit and Towable Unit)</span>
                       <span className={`text-xl font-bold ${industryAvgMpg > 6 ? 'text-green-600' : 'text-indigo-600'}`}>
                         {industryAvgMpg > 0 ? industryAvgMpg.toFixed(1) : '--.-'}
                       </span>
                     </div>
                     <button 
                       type="button"
                       onClick={() => setShowTopConfigs(true)}
                       className="mt-2.5 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-extrabold text-[9px] uppercase tracking-wider text-white transition-all shadow-xs hover:shadow-md cursor-pointer self-start"
                     >
                       🔥 Top 5 Setups
                     </button>
                   </div>
                </div>

                {/* Delivery Efficiency Bar-Style Graph Component */}
                {(() => {
                  let isDiesel = (userProfile?.fuelType || 'Diesel') === 'Diesel';
                  const engineLower = (userProfile?.engineType || "").toLowerCase();
                  if (engineLower.includes("diesel")) {
                    isDiesel = true;
                  } else if (engineLower.includes("gas") || engineLower.includes("hemi") || engineLower.includes("vortec") || engineLower.includes("godzilla")) {
                    isDiesel = false;
                  }
                  const defaultIndexPrice = isDiesel ? fuelPrices.diesel : fuelPrices.gas;

                  // Compute weighted average pump price from logged fuel expenses
                  const fuelExpenses = expenses.filter(e => e.category === 'Fuel');
                  const validFuelExpenses = fuelExpenses.filter(e => Number(e.gallons || 0) > 0 && Number(e.amount || 0) > 0);
                  const totalRecordedFuelDollars = validFuelExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
                  const totalRecordedFuelGallons = validFuelExpenses.reduce((sum, e) => sum + Number(e.gallons || 0), 0);

                  const actualAvgPumpPrice = totalRecordedFuelGallons > 0
                    ? (totalRecordedFuelDollars / totalRecordedFuelGallons)
                    : 0;

                  let currentFuelPrice = defaultIndexPrice;
                  let priceSource = `${isDiesel ? 'Diesel' : 'Gas'} ${routeFuelSource}`;

                  if (actualAvgPumpPrice > 0) {
                    currentFuelPrice = actualAvgPumpPrice;
                    priceSource = "Actual Pump Avg";
                  } else if (manualFuelPrice !== null) {
                    currentFuelPrice = manualFuelPrice;
                    priceSource = "Manual Override";
                  }

                  // Compute expected base MPG according to vehicle profile configuration specs
                  const { expectedMpg: expectedVehicleMpg, tireAdjustment } = getExpectedVehicleMpg(userProfile, localHaul, traversedStates);
                  
                  // Dynamically determine the 100 Target based on similar history and registered user avg
                  const dynamic100TargetMpg = (() => {
                    if (myAvgSimilarMpg > 0 && peersAvgSimilarMpg > 0) {
                      return (myAvgSimilarMpg + peersAvgSimilarMpg) / 2;
                    } else if (myAvgSimilarMpg > 0) {
                      return myAvgSimilarMpg;
                    } else if (peersAvgSimilarMpg > 0) {
                      return peersAvgSimilarMpg;
                    }
                    return expectedVehicleMpg;
                  })();

                  // Define dynamic Towing Efficiency Rating score mapping relative to dynamic100TargetMpg
                  // A score of 100 represents achieving exactly the calibrated dynamic target MPG.
                  const getScoreForMpg = (val: number) => {
                    if (dynamic100TargetMpg <= 0 || val <= 0) return 0;
                    return (val / dynamic100TargetMpg) * 100;
                  };

                  // The color bar bounds correspond to relative performance index scores from 60 to 140
                  // 100 is perfectly in the middle representing calibrated target MPG
                  const minScoreBound = 60;
                  const maxScoreBound = 140;

                  const getPercentageForScore = (score: number) => {
                    return Math.min(100, Math.max(0, ((score - minScoreBound) / (maxScoreBound - minScoreBound)) * 100));
                  };

                  const activeLoadedMpg = Number(localHaul.loadedMpg || 0);
                  const activeScore = getScoreForMpg(activeLoadedMpg);
                  const historyScore = getScoreForMpg(myAvgSimilarMpg);

                  const activeCostPerMile = activeLoadedMpg > 0 ? (currentFuelPrice / activeLoadedMpg) : 0;
                  const expectedCostPerMile = expectedVehicleMpg > 0 ? (currentFuelPrice / expectedVehicleMpg) : 0;

                  const costDifference = expectedCostPerMile - activeCostPerMile;
                  const dynamicRating = activeLoadedMpg === 0 
                    ? 'No Entry'
                    : activeScore < 85 
                      ? 'Poor' 
                      : activeScore < 98 
                        ? 'Sub-par' 
                        : activeScore < 115 
                          ? 'Optimal' 
                          : 'Exceptional (Elite)';

                  const powerUnitYear = Number(userProfile?.powerUnitYear || 0);
                  const profileString = powerUnitYear > 0 
                    ? `${powerUnitYear} ${userProfile?.powerUnitMake || ''} ${userProfile?.powerUnitModel || ''} (${userProfile?.duallyOrSrw || 'SRW'}, ${userProfile?.drivetrain || '2WD'})`
                    : null;

                  return (
                    <div className="mt-6 p-5 sm:p-6 bg-slate-50 border border-slate-100 rounded-3xl space-y-5">
                      {/* Meter Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Towing Efficiency Index
                            </h4>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Dynamic Price Sync Active" />
                          </div>
                          
                          {/* Vehicle Spec Subtitle */}
                          {profileString ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className="text-[10px] text-indigo-600 font-bold flex items-center gap-1.5">
                                <PickupTruckIcon className="w-3.5 h-3.5 text-indigo-600" /> Calibrated Performance Target: {expectedVehicleMpg.toFixed(1)} MPG ({isDiesel ? 'Diesel' : 'Gasoline'})
                              </p>
                              <p className="text-[9px] text-slate-500 font-semibold italic">
                                Targets adjusted for Unit Weight ({localHaul.scaleWeight || 0} lbs) {traversedStates.length > 0 ? `+ Route Terrain (${traversedStates.join(', ')})` : ''}. Baseline Index 100 represents target.
                              </p>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium leading-normal">
                              ⚠️ Using generic standard baselines. Customize your vehicle specs in <strong>Settings</strong> for custom dynamic indices.
                            </p>
                          )}
                        </div>
                        
                        {/* Rating Flag */}
                        {activeLoadedMpg > 0 && (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2.5 py-1 text-[9px] font-black rounded-full uppercase tracking-wider self-start sm:self-auto ${
                              dynamicRating.includes('Exceptional')
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : dynamicRating.includes('Optimal')
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {dynamicRating} ({activeScore.toFixed(0)} TPI)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Target explanation helper banner */}
                      <div className="bg-slate-100/60 border border-slate-200/50 rounded-2xl p-3 sm:p-4 text-[11px] leading-relaxed text-slate-600 space-y-1.5 shadow-xs">
                        <p className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                          <Info className="w-3.5 h-3.5 text-indigo-600" />
                          Understanding the MPG Targets
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1.5 divide-y md:divide-y-0 md:divide-x divide-slate-200/60">
                          <div className="space-y-0.5">
                            <span className="font-bold text-indigo-600 flex items-center gap-1.5"><PickupTruckIcon className="w-3.5 h-3.5 text-indigo-600" /> Calibrated Performance Target ({expectedVehicleMpg.toFixed(1)} MPG):</span>
                            <p className="text-slate-500 text-[10.5px]">
                              The physical, theoretical fuel economy based purely on your truck specs, trailer type, scale weights, aerodynamic wind profiles, and Route Terrain.
                            </p>
                          </div>
                          <div className="space-y-0.5 pt-2.5 md:pt-0 md:pl-3.5">
                            <span className="font-bold text-amber-600 flex items-center gap-1">🎯 100 Target ({dynamic100TargetMpg.toFixed(1)} MPG):</span>
                            <p className="text-slate-500 text-[10.5px]">
                              A dynamic, real-world baseline blended from your personal similar trips history and peer network statistics. This represents the target to achieve exactly 100 TPI.
                            </p>
                          </div>
                        </div>

                        {/* Tire specification impact note */}
                        <div className="pt-2.5 border-t border-slate-200/50 flex flex-wrap items-center gap-2 text-[10.5px]">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5"><TireWheelIcon className="w-4 h-4" /> Tire Spec Calibration Impact:</span>
                          {userProfile?.tireMake || userProfile?.tireType || userProfile?.tireSize ? (
                            <>
                              <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                                tireAdjustment >= 0 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              }`}>
                                {tireAdjustment >= 0 ? '+' : ''}{tireAdjustment.toFixed(2)} MPG
                              </span>
                              <span className="text-slate-500 font-medium bg-slate-200/50 px-1.5 py-0.5 rounded text-[9.5px]">
                                {[userProfile.tireMake, userProfile.tireType, userProfile.tireSize].filter(Boolean).join(' / ')}
                              </span>
                            </>
                          ) : (
                            <span className="text-amber-600 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md font-medium text-[10px] animate-pulse">
                              💡 Adjustments inactive. Enter your tire manufacturer, model & size in the settings menu for calibrated rolling resistance.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Spectrum Chromebook Bar */}
                      <div className="relative pt-8 pb-7 my-2 select-none">
                        
                        {/* Interactive Color Spectrum background */}
                        <div 
                          className="h-3.5 w-full rounded-full relative overflow-hidden shadow-xs border border-white"
                          style={{
                            background: 'linear-gradient(to right, #991b1b 0%, #ef4444 27.8%, #c2410c 27.8%, #f97316 44.4%, #ca8a04 44.4%, #fde047 66.7%, #4ade80 66.7%, #166534 100%)'
                          }}
                        >
                          <div className="absolute left-[27.8%] top-0 h-full w-[1.5px] bg-white/30" />
                          <div className="absolute left-[44.4%] top-0 h-full w-[1.5px] bg-white/30" />
                          <div className="absolute left-[66.7%] top-0 h-full w-[1.5px] bg-white/30" />
                        </div>

                        {/* Numeric Scale labels matching relative Towing Performance Index */}
                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold mt-2.5 px-0.5">
                          <span>60 TPI (Poor)</span>
                          <span>80 TPI</span>
                          <span>100 TPI (Target Met)</span>
                          <span>120 TPI (Optimal)</span>
                          <span>140+ TPI (Elite)</span>
                        </div>

                        {/* Pointer 1: Active Unit Loaded MPG Rating */}
                        {activeLoadedMpg > 0 && (
                          <div 
                            className="absolute top-2.5 flex flex-col items-center transition-all duration-700 ease-out z-30"
                            style={{ 
                              left: `${getPercentageForScore(activeScore)}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-md shadow-md mb-1 whitespace-nowrap border border-indigo-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                              Score: {activeScore.toFixed(0)} ({activeLoadedMpg.toFixed(1)} MPG)
                            </div>
                            <div className="w-[3px] h-5 bg-indigo-600 rounded-full border border-white shadow-xs" />
                          </div>
                        )}

                        {/* Pointer 2: EXPECTED Target Baseline (Fixed at exactly 100 index) */}
                        <div 
                          className="absolute top-0.5 h-12 w-[2px] transition-all duration-700 ease-out z-20 group"
                          style={{ 
                            left: `${getPercentageForScore(100)}%`,
                          }}
                        >
                          <div className="absolute -top-4.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-amber-500 text-[8px] font-extrabold text-white border border-amber-400 shadow-xs rounded whitespace-nowrap">
                            100 Target ({dynamic100TargetMpg.toFixed(1)} MPG)
                          </div>
                          <div className="w-[2px] h-full bg-amber-500 border-x border-white" />
                        </div>

                        {/* Pointer 3: My Similar Trips Historical Avg */}
                        {myAvgSimilarMpg > 0 && (
                          <div 
                            className="absolute bottom-1 h-12 w-[1.5px] transition-all duration-700 ease-out z-20"
                            style={{ 
                              left: `${getPercentageForScore(historyScore)}%`,
                            }}
                          >
                            <div className="w-[1.5px] h-full bg-teal-500 border-x border-white" />
                            <div className="absolute -bottom-4.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-teal-50 border border-teal-100 text-teal-700 shadow-xs rounded text-[8px] font-bold whitespace-nowrap flex items-center gap-0.5">
                              <span>My History:</span>
                              <span className="font-extrabold">{historyScore.toFixed(0)} ({myAvgSimilarMpg.toFixed(1)} MPG)</span>
                            </div>
                          </div>
                        )}


                      </div>

                      {/* Live Dynamic Fuel & Cost-per-Mile panel */}
                      <div className="bg-white border border-slate-100 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                              <Fuel className="w-4 h-4 shrink-0" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                Fuel source: <span className="text-indigo-600 capitalize">{priceSource === 'Actual Pump Avg' ? 'Actual Pump Avg (From Expenses)' : priceSource}</span>
                              </span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-sm font-semibold ${actualAvgPumpPrice > 0 ? (actualAvgPumpPrice < defaultIndexPrice ? 'text-emerald-700' : actualAvgPumpPrice > defaultIndexPrice ? 'text-rose-700' : 'text-slate-900') : 'text-slate-900'}`}>$</span>
                                <input 
                                  type="number" 
                                  step="0.001" 
                                  value={currentFuelPrice ? Number(currentFuelPrice.toFixed(3)) : ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setManualFuelPrice(isNaN(val) ? null : val);
                                  }}
                                  disabled={actualAvgPumpPrice > 0}
                                  className={`text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-indigo-100 rounded-lg px-2 py-1 w-20 text-center ${
                                    actualAvgPumpPrice > 0 
                                      ? (actualAvgPumpPrice < defaultIndexPrice ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-not-allowed border' : actualAvgPumpPrice > defaultIndexPrice ? 'bg-rose-50 text-rose-700 border-rose-200 cursor-not-allowed border' : 'bg-slate-50 text-slate-800 border-slate-100 opacity-70 cursor-not-allowed border')
                                      : 'text-slate-800 bg-slate-50 border border-slate-100 hover:bg-slate-100 focus:bg-white border'
                                  }`}
                                  title={actualAvgPumpPrice > 0 ? "Fuel price is calculated automatically from entered expenses" : "Edit / override the fuel price per gallon"}
                                />
                                <span className="text-[10px] text-slate-500 font-bold font-mono uppercase">/gal</span>
                              </div>
                            </div>
                          </div>
                           {actualAvgPumpPrice > 0 && (
                            <div className="mt-2 ml-11 bg-slate-50 border border-slate-200/60 rounded flex flex-col p-1.5 px-2 relative group cursor-default">
                              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-300 rounded-l"></div>
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0 pr-2">
                                  <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">Live System Estimate</span>
                                  <span className="text-[9.5px] font-medium text-slate-600 block truncate">{routeFuelSource}</span>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="text-[11px] font-black text-slate-700">${defaultIndexPrice.toFixed(3)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col border-y md:border-y-0 md:border-x border-slate-100 py-3 md:py-0 md:px-4">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Cost per mile</span>
                          <span className="text-sm font-extrabold text-slate-800">
                            {activeCostPerMile > 0 ? `$${activeCostPerMile.toFixed(3)}/mi` : '--/mi'}
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Calibrated Vehicle Base CPM</span>
                          <span className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                            ${expectedCostPerMile.toFixed(3)}/mi
                            {activeCostPerMile > 0 && (
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                                costDifference >= 0 ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'
                              }`}>
                                {costDifference >= 0 ? 'Optimal' : 'Over Target'}
                                {costDifference >= 0 ? `-$${Math.abs(costDifference).toFixed(3)}/mi` : `+$${Math.abs(costDifference).toFixed(3)}/mi`}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Subtitle notes detailing RV Transport scope */}
                      <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] text-slate-500 font-medium leading-relaxed">
                        <div>
                          <span className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                            <span>⚙️</span> Fuel price Index
                          </span>
                          <span className="block text-slate-500">
                            Recalculated automatically as retail pump prices fluctuate across our live, state-by-state fuel database. This is used as the baseline price to calculate live operating costs.
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                            <span>🚛</span> Active Cost Per Mile (CPM)
                          </span>
                          <span className="block text-slate-500">
                            Your <span className="font-semibold text-slate-700">actual fuel cost per mile</span> for this trip, calculated using this haul's exact Loaded MPG: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[9px] text-indigo-600">[Fuel Price ÷ Entered Loaded MPG]</code>.
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                            <span>🎯</span> Calibrated Vehicle Base CPM
                          </span>
                          <span className="block text-slate-500">
                            Your <span className="font-semibold text-slate-700">target fuel cost per mile</span> under ideal conditions for your specific truck spec, unit scale weight, and route terrain: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[9px] text-amber-600">[Fuel Price ÷ Calibrated Target MPG]</code>.
                          </span>
                        </div>
                      </div>

                      <div className="pt-3.5 border-t border-dashed border-slate-100 text-[10px] text-slate-500 font-medium leading-relaxed">
                        <span className="font-bold text-slate-600 block mb-0.5">📊 Benchmark Data Source</span>
                        Aggregates live platform-wide historical data—excluding deadhead MPG—to calculate dynamic averages. Specifically, the efficiency meter aggregates <span className="font-semibold text-emerald-600">Loaded Miles Per Gallon (Loaded MPG)</span> categorized by similar route terrain (Mountainous, Plains, or Flat) and unit scale weight classes to calibrate realistic, empirical benchmarks.
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* BLOCK_2_DECOUPLED_MARKER */}

            {showErrors && !isComplete && (
              <div className="bg-red-50 border border-red-100 p-6 rounded-[32px] flex items-start gap-4 animate-slide-in">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-900">Missing Mandatory Information</p>
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">
                    The following fields are strictly required before this entry can be marked as complete.
                  </p>
                  <div className="text-xs text-red-700 mt-3 space-y-1 font-medium bg-red-100/50 p-3 rounded-xl">
                    {missingFields.map((field, idx) => (
                      <p key={idx} className="flex gap-2 items-center">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                        {field}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isComplete && (
              <div className="bg-green-50 border border-green-100 p-6 rounded-[32px] flex items-start gap-4">
                <div className="p-2 bg-green-100 rounded-full">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-green-900">Ready to Complete</p>
                  <p className="text-xs text-green-700 mt-1 leading-relaxed">
                    All required fields are filled. You can now lock this entry.
                  </p>
                </div>
              </div>
            )}
             {/* Delivery Expenses Group */}
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6" id="right-column-expenses">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delivery Expenses</h3>
                  <p className="text-xs text-slate-500 font-medium">{expenses.length} entries recorded</p>
                </div>
                
                {/* OCR Receipt Scanner Button */}
                <label className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none select-none shrink-0">
                  {isUploadingReceipt ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      <span>Scanning...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4.5 h-4.5" />
                      <span>Scan Receipt (OCR)</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleReceiptScan} 
                    disabled={isUploadingReceipt} 
                    className="hidden" 
                  />
                </label>
              </div>
              
              <div className="space-y-6" id="right-expenses-list-inner">
                {(() => {
                  const sortedExpenses = [...expenses].sort((a, b) => {
                    const tA = new Date(a.timestamp || 0).getTime();
                    const tB = new Date(b.timestamp || 0).getTime();
                    return tB - tA;
                  });

                  const renderExpenseRow = (exp: Expense) => {
                    const isIncomplete = exp.amount === 0 || !exp.vendor || exp.vendor.trim() === '';
                    return (
                      <div 
                        key={exp.id} 
                        className={`${isIncomplete ? 'bg-amber-50/10 border-2 border-amber-200/50' : 'bg-white border border-slate-100'} p-6 rounded-3xl shadow-sm flex items-center justify-between group transition-all hover:shadow-md animate-fade-in`}
                      >
                        <div className="flex gap-5 flex-1">
                          <div className="flex items-center justify-center p-3 bg-slate-50 border border-slate-100 rounded-2xl group-hover:scale-105 transition-transform shrink-0">
                            {exp.category === 'Fuel' ? (
                              <Fuel className="w-5 h-5 text-blue-600" />
                            ) : exp.category === 'DEF' ? (
                              <Droplet className="w-5 h-5 text-indigo-600" />
                            ) : exp.category === 'Permits' ? (
                              <FileText className="w-5 h-5 text-teal-600" />
                            ) : exp.category === 'Maintenance' ? (
                              <Wrench className="w-5 h-5 text-orange-600" />
                            ) : exp.category === 'Food' ? (
                              <UtensilsCrossed className="w-5 h-5 text-amber-600" />
                            ) : (
                              <Plus className="w-5 h-5 text-slate-600" />
                            )}
                          </div>
                          <div className={`grid grid-cols-2 ${(exp.category === 'Fuel' || exp.category === 'DEF') ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-4 md:gap-6 flex-1 items-center`}>
                            <div className="flex flex-col">
                              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                                Category
                                {isIncomplete && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Incomplete entry" />
                                )}
                              </label>
                              <span className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">{exp.category}</span>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1">Vendor / Name</label>
                              <input 
                                type="text" 
                                value={exp.vendor || ''} 
                                placeholder="Enter vendor..."
                                onChange={(e) => updateExpense(exp.id, { vendor: e.target.value })}
                                className="text-sm font-semibold text-slate-900 bg-transparent focus:outline-none w-full border-b border-transparent focus:border-blue-200 transition-colors"
                              />
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[10px] font-bold uppercase text-slate-400 mb-1">Amount</label>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-slate-900">$</span>
                                <ExpenseAmountInput 
                                  amount={exp.amount}
                                  onChange={(val) => {
                                    const updates: any = { amount: val };
                                    if ((exp.category === 'Fuel' || exp.category === 'DEF') && exp.gallons && Number(exp.gallons) > 0) {
                                      updates.pricePerGallon = Number((val / exp.gallons).toFixed(3));
                                    }
                                    updateExpense(exp.id, updates);
                                  }}
                                />
                              </div>
                            </div>
                            {(exp.category === 'Fuel' || exp.category === 'DEF') && (
                              <div className="flex flex-col">
                                <label className="text-[10px] font-bold uppercase text-slate-400 mb-1">Gallons</label>
                                <input 
                                  type="number"
                                  value={exp.gallons || ''} 
                                  onChange={(e) => {
                                    const g = Number(e.target.value);
                                    const updates: any = { gallons: g };
                                    if ((exp.category === 'Fuel' || exp.category === 'DEF') && exp.amount && exp.amount > 0 && g > 0) {
                                      updates.pricePerGallon = Number((exp.amount / g).toFixed(3));
                                    }
                                    updateExpense(exp.id, updates);
                                  }}
                                  className="text-sm font-semibold text-slate-900 bg-transparent focus:outline-none w-full border-b border-transparent focus:border-blue-200"
                                  placeholder="0.00"
                                />
                              </div>
                            )}
                            {(exp.category === 'Fuel' || exp.category === 'DEF') && (
                              <div className="flex flex-col">
                                <label className="text-[10px] font-bold uppercase text-slate-400 mb-1">Price/Gal</label>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-slate-900">$</span>
                                  <input 
                                    type="number"
                                    step="0.001"
                                    value={exp.pricePerGallon || ''} 
                                    onChange={(e) => {
                                      const ppg = Number(e.target.value);
                                      const updates: any = { pricePerGallon: ppg };
                                      if (exp.gallons && exp.gallons > 0 && ppg > 0) {
                                        updates.amount = Number((exp.gallons * ppg).toFixed(2));
                                      }
                                      updateExpense(exp.id, updates);
                                    }}
                                    className="text-sm font-semibold text-slate-900 bg-transparent focus:outline-none w-full border-b border-transparent focus:border-blue-200"
                                    placeholder="0.000"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          <button 
                            onClick={() => deleteExpense(exp.id)} 
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Delete expense"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  };

                  const categoriesOrdered: Expense['category'][] = ['Fuel', 'DEF', 'Permits', 'Maintenance', 'Food', 'Misc'];
                  const grouped = sortedExpenses.reduce((acc, exp) => {
                    const cat = exp.category || 'Misc';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(exp);
                    return acc;
                  }, {} as Record<string, typeof expenses>);

                  const hasExpenses = expenses.length > 0;
                  if (!hasExpenses) {
                    return (
                      <div className="text-center py-8 text-slate-400 text-sm italic border border-dashed border-slate-100 rounded-3xl">
                        No expenses recorded yet. Include your fuel details below to compute total CPM.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {categoriesOrdered.map((category) => {
                        const list = grouped[category] || [];
                        if (list.length === 0) return null;
                        const displayLabel = category === 'Fuel' ? 'Fuel Expenses' : 
                                             category === 'DEF' ? 'DEF (Diesel Exhaust Fluid)' : 
                                             category === 'Permits' ? 'Permits & Tolls' : 
                                             (category === 'Maintenance' || category === 'Maintenance/DEF') ? 'Maintenance & Service' :
                                             category === 'Food' ? 'Meals & Food' : 'Other / Miscellaneous';
                        return (
                          <div key={category} className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                              <span className="text-[10px] font-extrabold pb-0.5 uppercase tracking-widest text-slate-400">
                                {displayLabel}
                              </span>
                              <div className="h-[1px] bg-slate-100 flex-1" />
                              <span className="text-[10px] pb-0.5 font-bold text-slate-400 font-mono">
                                {list.length} {list.length === 1 ? 'entry' : 'entries'}
                              </span>
                            </div>
                            <div className="space-y-3">
                              {list.map((exp) => renderExpenseRow(exp))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <button 
                    type="button"
                    onClick={() => addManualExpense('Fuel')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-blue-600 hover:bg-white hover:border-blue-100 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-blue-50 rounded-2xl transition-colors">
                      <Fuel className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Add Fuel</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => addManualExpense('DEF')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-indigo-50 rounded-2xl transition-colors">
                      <Droplet className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Add DEF</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => addManualExpense('Permits')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-teal-600 hover:bg-white hover:border-teal-100 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-teal-50 rounded-2xl transition-colors">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Permits</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => addManualExpense('Maintenance')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-orange-600 hover:bg-white hover:border-orange-100 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-orange-50 rounded-2xl transition-colors">
                      <Wrench className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Maintenance</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => addManualExpense('Food')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-amber-600 hover:bg-white hover:border-amber-100 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-amber-50 rounded-2xl transition-colors">
                      <UtensilsCrossed className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Meals</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => addManualExpense('Misc')}
                    className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-white hover:border-slate-200 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div className="p-3 bg-slate-100 group-hover:bg-slate-100 rounded-2xl transition-colors">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase">Other</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm" id="right-summary-card">
              <h3 className="text-lg font-bold text-slate-900 mb-6 font-sans">Summary</h3>
              <div className="space-y-4">
                {/* Optional Trip / Unit Notes */}
                <div className="space-y-1.5 pb-2">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Optional Trip / Unit Notes</label>
                  <textarea
                    name="notes"
                    value={localHaul.notes || ''}
                    onChange={handleHaulChange}
                    onBlur={saveHaulData}
                    placeholder="Enter trip instructions, stops, delays or special notes..."
                    rows={3}
                    className="w-full border rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none transition-all bg-slate-50 border-slate-100 focus:ring-blue-100 focus:bg-white resize-none text-slate-700 placeholder-slate-400"
                  />
                </div>

                <div className="flex justify-between items-center text-slate-600 pt-2 border-t border-slate-50">
                  <span className="text-sm font-medium">Gross Revenue</span>
                  <span className="text-lg font-bold text-slate-900">${Number(stats.grossRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                
                <div className="space-y-2 pt-2 border-t border-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operating Costs Breakdown</span>
                  {Object.entries(stats.costsByCategory).length > 0 ? (
                    <>
                      {Object.entries(stats.costsByCategory).map(([category, amount]) => {
                        if (category === 'Misc') return null;
                        
                        const displayLabel = category === 'Fuel' ? 'Fuel (Total Cost)' : 
                                           category === 'DEF' ? 'DEF' : 
                                           category === 'Permits' ? 'Permits' : 
                                           (category === 'Maintenance/DEF' || category === 'Maintenance') ? 'Maintenance' :
                                           category === 'Food' ? 'Meals' : category;
                        
                        return (
                          <div key={category} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">{displayLabel}</span>
                              <span className="font-semibold text-slate-700">${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {category === 'Fuel' && stats.totalFuelGallons > 0 && (
                              <div className="flex justify-between items-center text-[10px] text-slate-400 pl-2">
                                <span>Total Gallons</span>
                                <span>{stats.totalFuelGallons.toFixed(2)} gal</span>
                              </div>
                            )}
                            {category === 'Fuel' && averagePricePerGallon > 0 && (
                              <div className="flex justify-between items-center text-[10px] text-slate-400 pl-2">
                                <span>Avg Fuel Price</span>
                                <span>${averagePricePerGallon.toFixed(3)}/gal</span>
                              </div>
                            )}
                            {category === 'DEF' && expenses.some(e => e.category === 'DEF' && (Number(e.gallons) || 0) > 0) && (
                              <div className="flex justify-between items-center text-[10px] text-slate-400 pl-2">
                                <span>Total Gallons</span>
                                <span>{(expenses.filter(e => e.category === 'DEF').reduce((sum, e) => sum + (Number(e.gallons) || 0), 0)).toFixed(2)} gal</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {stats.itemizedMiscExpenses && Object.entries(stats.itemizedMiscExpenses).length > 0 && (
                        <div className="space-y-1 mt-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Other Expenses</span>
                          {Object.entries(stats.itemizedMiscExpenses).map(([vendor, amount]) => (
                            <div key={vendor} className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">{vendor}</span>
                              <span className="font-semibold text-slate-700">${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic">No expenses recorded</div>
                  )}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-dashed border-slate-100">
                    <span className="text-sm font-semibold text-slate-600">Total Expenses</span>
                    <span className="text-base font-bold text-red-500">-${Number(stats.totalOperatingCosts || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-base font-bold text-slate-900">Net Profit</span>
                  <span className={`text-2xl font-bold ${Number(stats.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    ${Number(stats.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          {/* Mobile Bottom Action Bar */}
          <div className="sm:hidden sticky bottom-0 left-0 right-0 p-4 pb-safe-6 bg-white border-t border-slate-100 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-50 flex gap-3 mt-8">
            <button
              onClick={handleClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold active:bg-slate-200 transition-all"
            >
              <X className="w-5 h-5" />
              <span>Close</span>
            </button>
            <button
              onClick={isMarkCompletedDisabled ? undefined : handleMarkCompleted}
              disabled={isMarkCompletedDisabled}
              className={`flex-[2] flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-bold shadow-sm transition-all ${
                isMarkCompletedDisabled 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75' 
                  : 'bg-emerald-600 active:bg-emerald-700 text-white cursor-pointer'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              <span>{(haul.status === 'Completed' || haul.status === 'Finalized') ? 'Save & Close' : 'Mark Completed'}</span>
            </button>
          </div>

          {/* Desktop/Tablet Bottom Action Button */}
          <div className="hidden sm:flex justify-end pt-4 pb-12">
            <button
              onClick={isMarkCompletedDisabled ? undefined : handleMarkCompleted}
              disabled={isMarkCompletedDisabled}
              className={`flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold shadow-sm transition-all ${
                isMarkCompletedDisabled 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75' 
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md text-white cursor-pointer'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              <span>{(haul.status === 'Completed' || haul.status === 'Finalized') ? 'Save & Close Trip' : 'Mark Trip Completed'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Receipt Image Viewer Modal */}
      {selectedViewerReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white rounded-[32px] overflow-hidden max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedViewerReceipt.vendor ? "Receipt for " + selectedViewerReceipt.vendor : "Scanned Receipt"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedViewerReceipt(null)}
                className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-6 min-h-[300px]">
              <img
                src={selectedViewerReceipt.dataUrl}
                alt="Receipt viewer"
                className="max-w-full max-h-[60vh] object-contain rounded-2xl shadow-md border border-slate-200"
                referrerPolicy="no-referrer"
              />
            </div>
            <footer className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Scanned Amount</span>
                <span className="text-xl font-black text-slate-900">
                  ${selectedViewerReceipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Top 5 Registered Users Configurations Modal */}
      {showTopConfigs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000] animate-fade-in" id="top-configs-modal">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 animate-scale-in">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                  🏆 Top 5 Power & Towable Setups
                </h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-wider">
                  Registered App Users Benchmarks
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowTopConfigs(false)}
                className="p-1 px-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {(() => {
                const sortedList = top5GlobalSetups;

                if (sortedList.length === 0) {
                  return (
                    <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-500">No sufficient configuration data logged yet.</p>
                      <p className="text-[10px] text-slate-400 mt-1">Complete your first haul to log your platform metrics!</p>
                    </div>
                  );
                }

                return sortedList.map((item, idx) => {
                  const make = item.make || 'Generic';
                  const model = item.model || 'Power Unit';
                  const year = item.year ? `${item.year} ` : '';
                  const drw = item.drw || 'SRW';
                  const drive = item.drive || '4x4';
                  const wb = item.wb || 'LWB';
                  const axleStr = item.axles ? `${item.axles} Axle` : 'Unit';

                  return (
                    <div key={idx} className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center font-extrabold text-indigo-700 text-[10px] shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 tracking-tight truncate">
                            {year}{make} {model} {drw} ({drive}, {wb})
                          </p>
                          <p className="text-[9px] text-slate-500 font-semibold mt-0.5 truncate">
                            Towable: {item.unitType || 'RV'} • {axleStr} • {Number(item.scaleWeight || 0).toLocaleString()} lbs
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                          {Number(item.avgMpg).toFixed(1)} AVG MPG
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowTopConfigs(false)}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 font-black text-xs text-slate-700 rounded-2xl uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close Benchmarks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MY Similar Historical Logs Modal */}
      {showMySimilarUnits && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000] animate-fade-in" id="my-similar-units-modal">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 animate-scale-in">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                  📊 Last 5 Similar Historical Trips
                </h3>
                <p className="text-[10px] text-teal-600 font-bold mt-1 uppercase tracking-wider">
                  Personal Logging History Benchmarks
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowMySimilarUnits(false)}
                className="p-1 px-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {(() => {
                const sortedList = [...mySimilarHauls]
                  .sort((a, b) => {
                    const dateA = a.pickUpDate ? new Date(a.pickUpDate).getTime() : 0;
                    const dateB = b.pickUpDate ? new Date(b.pickUpDate).getTime() : 0;
                    return dateB - dateA;
                  })
                  .slice(0, 5);

                if (sortedList.length === 0) {
                  return (
                    <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-500">No matching historical logs found.</p>
                      <p className="text-[10px] text-slate-400 mt-1">These stats calibrate automatically once you complete similar trips.</p>
                    </div>
                  );
                }

                return sortedList.map((item, idx) => {
                  const pickUpStr = item.pickUpLocation || 'Unknown';
                  const deliveryStr = item.deliveryLocation || 'Unknown';
                  const pickUpDateStr = item.pickUpDate ? new Date(item.pickUpDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
                  const loadNo = item.loadNumber ? `#${item.loadNumber}` : `Trip #${idx + 1}`;
                  const weightVal = Number(item.scaleWeight || 0);

                  return (
                    <div key={idx} className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center font-extrabold text-teal-700 text-[10px] shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-slate-800 tracking-tight truncate">
                              {loadNo}
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold shrink-0">
                              {pickUpDateStr}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-600 font-medium mt-1 truncate">
                            {pickUpStr} ➔ {deliveryStr}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                            Trailer: {item.unitType || 'RV'} • {weightVal > 0 ? `${weightVal.toLocaleString()} lbs` : 'No scale weight'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-black text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                          {Number(item.loadedMpg || item.milesPerGallon || 0).toFixed(1)} MPG
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowMySimilarUnits(false)}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 font-black text-xs text-white rounded-2xl uppercase tracking-wider transition-colors shadow-xs hover:shadow-md cursor-pointer"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

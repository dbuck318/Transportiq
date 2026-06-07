export interface Haul {
  id: string;
  unitNumber: string;
  unitType: string;
  loadNumber: string;
  customerName?: string;
  pickUpDate: string;
  pickUpLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  ratePerMile: number;
  scaleWeight: number;
  grossWeight: number;
  grossRevenue: number;
  totalOperatingCosts: number;
  netProfit: number;
  milesPerGallon: number;
  loadedMpg: number;
  deadheadMpg: number;
  status: 'Active' | 'Completed' | 'Finalized';
  ownerId: string;
  isRecalled?: boolean;
  folder?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Expense {
  id: string;
  haulId: string;
  category: 'Fuel' | 'DEF' | 'Permits' | 'Maintenance' | 'Maintenance/DEF' | 'Food' | 'Misc' | 'Toll';
  vendor: string;
  amount: number;
  gallons?: number;
  pricePerGallon?: number;
  timestamp: string;
  ownerId: string;
}

export interface OCRResult {
  vendor: string;
  timestamp: string;
  category: 'Fuel' | 'DEF' | 'Permits' | 'Maintenance' | 'Maintenance/DEF' | 'Food' | 'Misc' | 'Toll';
  amount: number;
  gallons?: number;
  pricePerGallon?: number;
  defItem?: {
    vendor: string;
    timestamp: string;
    category: 'DEF';
    amount: number;
    gallons?: number;
    pricePerGallon?: number;
  } | null;
}

export interface ScannedReceipt {
  id: string;
  fileName: string;
  fileType: string;
  dataUrl: string;
  timestamp: string;
  vendor: string;
  amount: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: any;
  lastLogin?: any;
  fuelType?: 'Gas' | 'Diesel';
  powerUnitYear?: number | string;
  powerUnitMake?: string;
  powerUnitModel?: string;
  engineType?: string;
  duallyOrSrw?: 'DRW' | 'SRW';
  drivetrain?: '4x4' | '2WD';
  powerUnitScaleWeight?: number | string;
  otherVehicleNotes?: string;
}


import { Haul, Expense } from '../types';

export function calculateTotals(
  haul: Haul, 
  expenses: Expense[], 
  options: { isExpensesLoaded?: boolean; hasModifiedExpenses?: boolean } = {}
) {
  const miles = Number(haul.totalMiles || 0);
  const loadedMiles = Number(haul.loadedMiles || 0);
  const deadheadMiles = Number(haul.deadheadMiles || 0);
  const rate = Number(haul.ratePerMile || 0);
  const scaleWt = Number(haul.scaleWeight || 0);

  const grossRevenue = Number((loadedMiles * rate).toFixed(2));

  const dbOperatingCosts = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  
  // By default, assume calculateTotals without options is running on the frontend/historical
  // where expenses array is not fully loaded.
  let isTrustingExpenses = false;
  if (options.isExpensesLoaded && (expenses.length > 0 || options.hasModifiedExpenses)) {
    isTrustingExpenses = true;
  }

  const totalOperatingCosts = isTrustingExpenses 
    ? dbOperatingCosts 
    : (dbOperatingCosts || Number(haul.totalOperatingCosts || 0));

  const netProfit = grossRevenue - totalOperatingCosts;

  const totalFuelDollars = expenses
    .filter(e => e.category === 'Fuel')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  const totalFuelGallons = expenses
    .filter(e => e.category === 'Fuel')
    .reduce((sum, e) => sum + Number(e.gallons || 0), 0);

  const fuelWithPrice = expenses.filter(
    e => e.category === 'Fuel' && typeof e.pricePerGallon === 'number' && e.pricePerGallon > 0
  );
  const avgFuelPrice = fuelWithPrice.length > 0
    ? fuelWithPrice.reduce((sum, e) => sum + Number(e.pricePerGallon || 0), 0) / fuelWithPrice.length
    : 0;
  
  // Calculate specific MPG based on fuel pumped
  const calculatedMpg = totalFuelGallons > 0 ? miles / totalFuelGallons : 0;

  // Manual Weighted MPG calculation based on Loaded MPG, actual trip miles, Deadhead miles, and Deadhead MPG
  const loadedMpg = Number(haul.loadedMpg || 0);
  const deadheadMpg = Number(haul.deadheadMpg || 0);
  
  let weightedMpg = 0;
  
  if (loadedMpg > 0 && deadheadMpg > 0) {
    if (miles > 0) {
      const lm = Math.max(0, miles - deadheadMiles);
      const loadedGallons = lm / loadedMpg;
      const deadheadGallons = deadheadMiles / deadheadMpg;
      const totalGallonsUsed = loadedGallons + deadheadGallons;
      weightedMpg = totalGallonsUsed > 0 ? miles / totalGallonsUsed : 0;
    } else {
      weightedMpg = (loadedMpg + deadheadMpg) / 2;
    }
  } else if (loadedMpg > 0 && (deadheadMiles === 0 || deadheadMpg === 0)) {
    weightedMpg = loadedMpg;
  } else if (deadheadMpg > 0 && (miles === 0 || (miles - deadheadMiles) <= 0 || loadedMpg === 0)) {
    weightedMpg = deadheadMpg;
  } else if (loadedMpg > 0) {
    weightedMpg = loadedMpg;
  } else if (deadheadMpg > 0) {
    weightedMpg = deadheadMpg;
  }

  // Use manual MPG if provided, otherwise weighted, otherwise fallback to calculated
  const manualMpg = Number(haul.milesPerGallon || 0);
  const mpg = manualMpg > 0 ? manualMpg : (weightedMpg > 0 ? weightedMpg : calculatedMpg);
  
  // Weight Efficiency Index (WEI)
  const wei = (mpg > 0 && scaleWt > 0) ? (mpg / (scaleWt / 1000)) : 0;

  const costsByCategory = expenses.reduce((acc, exp) => {
    const cat = exp.category || 'Misc';
    acc[cat] = (acc[cat] || 0) + Number(exp.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const itemizedMiscExpenses = expenses
    .filter(e => e.category === 'Misc')
    .reduce((acc, exp) => {
      const vendor = exp.vendor || 'Other';
      acc[vendor] = (acc[vendor] || 0) + Number(exp.amount || 0);
      return acc;
    }, {} as Record<string, number>);

  return {
    grossRevenue,
    totalOperatingCosts,
    costsByCategory,
    itemizedMiscExpenses,
    totalFuelGallons,
    netProfit,
    avgFuelPrice,
    mpg,
    weightedMpg,
    calculatedMpg,
    wei
  };
}

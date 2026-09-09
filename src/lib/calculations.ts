import { Haul, Expense } from '../types';

export function parseCleanWeight(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  
  // Clean string: remove commas, convert to lowercase
  const str = String(val).toLowerCase().replace(/,/g, '');
  
  // Try to find digits
  const matches = str.match(/\d+(\.\d+)?/g);
  if (matches) {
    // Sum numbers found. E.g., "12,500 and 3 lb" -> [12500, 3] -> sum is 12503!
    const sum = matches.reduce((acc, curr) => acc + Number(curr), 0);
    return sum;
  }
  return 0;
}

export function calculateTotals(
  haul: Haul, 
  expenses: Expense[], 
  options: { isExpensesLoaded?: boolean; hasModifiedExpenses?: boolean } = {}
) {
  const miles = Number(haul.totalMiles || 0);
  const loadedMiles = Number(haul.loadedMiles || 0);
  const deadheadMiles = Number(haul.deadheadMiles || 0);
  const rate = Number(haul.ratePerMile || 0);
  const scaleWt = parseCleanWeight(haul.scaleWeight);

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

  // Segment distances
  const finalDeadheadMiles = Number(haul.deadheadMiles || 0);
  const finalLoadedMiles = Number(haul.loadedMiles || 0) > 0 
    ? Number(haul.loadedMiles) 
    : Math.max(0, Number(haul.totalMiles || 0) - finalDeadheadMiles);

  const finalTotalMiles = (finalLoadedMiles + finalDeadheadMiles) > 0
    ? (finalLoadedMiles + finalDeadheadMiles)
    : Number(haul.totalMiles || 0);
  
  let weightedMpg = 0;
  
  if (loadedMpg > 0 && deadheadMpg > 0) {
    if (finalTotalMiles > 0) {
      weightedMpg = ((loadedMpg * finalLoadedMiles) + (deadheadMpg * finalDeadheadMiles)) / finalTotalMiles;
    } else {
      weightedMpg = (loadedMpg + deadheadMpg) / 2;
    }
  } else if (loadedMpg > 0) {
    weightedMpg = loadedMpg;
  } else if (deadheadMpg > 0) {
    weightedMpg = deadheadMpg;
  }

  // Priority: 1. Dynamic weighted average from entered MPG values, 2. Dynamic calculated MPG from fuel expenses, 3. Saved baseline milesPerGallon
  const savedMpgFallback = Number(haul.milesPerGallon || 0);
  const mpg = weightedMpg > 0 ? weightedMpg : (calculatedMpg > 0 ? calculatedMpg : savedMpgFallback);
  
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

import { useState, useEffect } from 'react';
import { Haul, Expense } from '../types';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Map, X, Loader2, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeParseDate } from '../lib/dateUtils';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface Props {
  hauls: Haul[];
  compact?: boolean;
  timeRange?: '7d' | '30d' | '2m' | '3m' | '1y' | 'all';
  ownerId?: string;
}

export default function WeeklySummary({ hauls = [], compact, timeRange = '7d', ownerId }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'profit' | 'distance' | 'expenses' | null>(null);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseData, setExpenseData] = useState<{
    fuel: number;
    def: number;
    permits: number;
    maintenance: number;
    meals: number;
    misc: { vendor: string; amount: number }[];
  } | null>(null);

  // referenceDate is always today's system date to ensure timeframes are relative to right now.
  const referenceDate = new Date();
  
  const getStartDate = (ref: Date) => {
    const d = new Date(ref.getTime());
    d.setHours(0, 0, 0, 0);
    switch (timeRange) {
      case '7d': d.setDate(d.getDate() - 6); break;
      case '30d': d.setDate(d.getDate() - 29); break;
      case '2m': d.setMonth(d.getMonth() - 2); break;
      case '3m': d.setMonth(d.getMonth() - 3); break;
      case '1y': d.setFullYear(d.getFullYear() - 1); break;
      case 'all': return new Date(0);
    }
    return d;
  };

  const startDate = getStartDate(referenceDate);
  
  // Set end boundaries to the end of reference line so it is fully inclusive
  const compareEndDate = new Date(referenceDate.getTime());
  compareEndDate.setHours(23, 59, 59, 999);

  const filteredHauls = (hauls || []).filter(h => {
    const rawDate = safeParseDate(h.deliveryDate) || safeParseDate(h.pickUpDate);
    
    if (!rawDate) {
      // If there is no specific completed date, only report under All Time
      return timeRange === 'all';
    }

    // Normalize hours to noon (12:00) to safely bypass local timezone absolute midnight boundary issues
    const d = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate(), 12, 0, 0);
    
    if (timeRange === 'all') {
      return true;
    }
    return d.getTime() >= startDate.getTime() && d.getTime() <= compareEndDate.getTime();
  });
  
  const totalMiles = filteredHauls.reduce((sum, h) => sum + Number(h.loadedMiles || 0), 0);
  const grossRevenue = filteredHauls.reduce((sum, h) => sum + Number(h.grossRevenue || 0), 0);
  const totalCosts = filteredHauls.reduce((sum, h) => sum + Number(h.totalOperatingCosts || 0), 0);
  const netProfit = grossRevenue - totalCosts;

  useEffect(() => {
    if (selectedMetric === 'expenses' && ownerId && filteredHauls.length > 0) {
        setLoadingExpenses(true);
        const fetchExpenses = async () => {
            let fuel = 0, def = 0, permits = 0, maintenance = 0, meals = 0;
            const misc: { vendor: string; amount: number }[] = [];
            
            const promises = filteredHauls.map(h => getDocs(query(collection(db, 'hauls', h.id, 'expenses'), where('ownerId', '==', ownerId))));
            try {
                const snaps = await Promise.all(promises);
                snaps.forEach(snap => {
                    snap.docs.forEach(doc => {
                        const data = doc.data() as Expense;
                        const amt = Number(data.amount || 0);
                        if (data.category === 'Fuel') fuel += amt;
                        else if (data.category === 'DEF') def += amt;
                        else if (data.category === 'Permits') permits += amt;
                        else if (data.category === 'Maintenance' || data.category === 'Maintenance/DEF') maintenance += amt;
                        else if (data.category === 'Food') meals += amt;
                        else if (data.category === 'Misc') misc.push({ vendor: data.vendor || 'Unknown', amount: amt });
                        else if (data.category === 'Toll') misc.push({ vendor: data.vendor || 'Toll', amount: amt });
                    });
                });
                
                const groupedMisc = misc.reduce((acc, curr) => {
                    if (!acc[curr.vendor]) acc[curr.vendor] = 0;
                    acc[curr.vendor] += curr.amount;
                    return acc;
                }, {} as Record<string, number>);
                
                const miscArray = Object.entries(groupedMisc).map(([vendor, amount]) => ({ vendor, amount })).sort((a,b) => b.amount - a.amount);
                
                setExpenseData({ fuel, def, permits, maintenance, meals, misc: miscArray });
            } catch (err) {
                console.error("Error fetching expenses: ", err);
            } finally {
                setLoadingExpenses(false);
            }
        };
        fetchExpenses();
    }
  }, [selectedMetric, ownerId, filteredHauls]);

  const timeRangeLabels = {
    '7d': '7-Day',
    '30d': '30-Day',
    '2m': '2-Month',
    '3m': '3-Month',
    '1y': '1-Year',
    'all': 'All-Time'
  };
  const labelPrefix = timeRangeLabels[timeRange];

  const formattedRefDate = referenceDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedStartDate = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const spanText = timeRange === 'all' 
    ? `All History (up to ${formattedRefDate})`
    : `${formattedStartDate} — ${formattedRefDate}`;

  if (compact) {
    return (
      <div className="flex gap-8">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium">Revenue</span>
          <span className="text-sm font-semibold">${grossRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium">Net {timeRange.toUpperCase()}</span>
          <span className={`text-sm font-semibold ${netProfit < 0 ? 'text-red-500' : 'text-green-600'}`}>
            ${netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1 py-1 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] text-slate-500 font-medium">
        <span className="flex items-center gap-1.5 bg-white border border-slate-200/60 px-2.5 py-1 rounded-xl shadow-xs text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          Period coverage: <strong className="text-blue-600 font-semibold">{labelPrefix} ({spanText})</strong>
        </span>
        <span className="px-2.5 py-1 text-slate-500">
          {filteredHauls.length === 0 
            ? 'No completed deliveries in this range' 
            : `Showing stats for ${filteredHauls.length} of ${hauls.length} completed ${hauls.length === 1 ? 'delivery' : 'deliveries'}`}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          onClick={() => setSelectedMetric('revenue')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-blue-200"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">{labelPrefix} Revenue</p>
            <p className="text-2xl font-bold text-slate-900">${grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div 
          onClick={() => setSelectedMetric('distance')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-slate-300"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-slate-50 text-slate-500 rounded-2xl">
              <Map className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">{labelPrefix} Paid Mileage</p>
            <p className="text-2xl font-bold text-slate-900">{totalMiles.toLocaleString()} <span className="text-sm font-normal text-slate-400 ml-1">MI</span></p>
          </div>
        </div>

        <div 
          onClick={() => setSelectedMetric('expenses')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-red-200"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-slate-50 text-slate-500 rounded-2xl">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">{labelPrefix} Expenses</p>
            <p className="text-2xl font-bold text-slate-900">${totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div 
          onClick={() => setSelectedMetric('profit')}
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-green-200"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-2.5 rounded-2xl ${netProfit >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {netProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">{labelPrefix} Net Profit</p>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedMetric && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedMetric === 'revenue' && `${labelPrefix} Revenue Breakdown`}
                    {selectedMetric === 'profit' && `${labelPrefix} Net Profit Breakdown`}
                    {selectedMetric === 'distance' && `${labelPrefix} Paid Mileage Breakdown`}
                    {selectedMetric === 'expenses' && `${labelPrefix} Expenses Breakdown`}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Details for specific loads over this period
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedMetric(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <div className="space-y-4">
                  {filteredHauls.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 italic">No loads found for the selected time range.</div>
                  ) : selectedMetric === 'expenses' ? (
                    loadingExpenses ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      </div>
                    ) : expenseData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">Fuel</span>
                            <span className="text-lg font-bold text-red-500">${expenseData.fuel.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">DEF</span>
                            <span className="text-lg font-bold text-red-500">${expenseData.def.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">Permits</span>
                            <span className="text-lg font-bold text-red-500">${expenseData.permits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">Maintenance</span>
                            <span className="text-lg font-bold text-red-500">${expenseData.maintenance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">Meals</span>
                            <span className="text-lg font-bold text-red-500">${expenseData.meals.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        {expenseData.misc.length > 0 && (
                          <div className="mt-8">
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Other Expenses</h4>
                            <div className="space-y-2">
                              {expenseData.misc.map((m, i) => (
                                <div key={i} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                                  <span className="text-sm font-medium text-slate-700">{m.vendor}</span>
                                  <span className="text-md font-bold text-red-500">${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500 italic">Unable to load expenses.</div>
                    )
                  ) : (
                    filteredHauls.map((haul, idx) => (
                      <div key={haul.id || idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">Unit: {haul.unitNumber}</p>
                            {haul.folder && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-[9px] font-semibold border border-purple-100/50 shrink-0">
                                <Folder className="w-2.5 h-2.5 mr-1" />
                                {haul.folder}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{String(haul.pickUpLocation || 'Origin').split(',')[0]} → {String(haul.deliveryLocation || 'Destination').split(',')[0]}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{haul.deliveryDate || haul.pickUpDate || 'Historical'}</p>
                        </div>
                        <div className="text-right">
                          {selectedMetric === 'revenue' && (
                            <p className="text-lg font-bold text-slate-900">
                              ${Number(haul.grossRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          {selectedMetric === 'profit' && (
                            <p className={`text-lg font-bold ${Number(haul.netProfit || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                              ${Number(haul.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          {selectedMetric === 'distance' && (
                            <p className="text-lg font-bold text-slate-900">
                              {Number(haul.loadedMiles || 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">MI</span>
                            </p>
                          )}
                          {selectedMetric === 'expenses' && (
                            <p className="text-lg font-bold text-red-500">
                              ${Number(haul.totalOperatingCosts || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

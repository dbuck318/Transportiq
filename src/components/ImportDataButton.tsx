import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { formatForInput } from '../lib/dateUtils';

interface Props {
  ownerId: string;
}

export default function ImportDataButton({ ownerId }: Props) {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64Data = (event.target?.result as string).split(',')[1];
          const response = await fetch('/api/parse-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentBase64: base64Data,
              mimeType: file.type || 'application/octet-stream'
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${response.status}: Failed to parse document`);
          }

          const haulsData = await response.json();
          if (!Array.isArray(haulsData)) {
             throw new Error('Invalid response format');
          }

          const path = 'hauls';
          
          const parseNumber = (val: any): number => {
            if (typeof val === 'number') return val;
            if (val === null || val === undefined) return 0;
            const cleaned = String(val).replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
          };

          for (const haul of haulsData) {
             const loadedMiles = parseNumber(haul.loadedMiles);
             const deadheadMiles = parseNumber(haul.deadheadMiles);
             let totalMiles = parseNumber(haul.totalMiles ?? haul.miles);
             if (totalMiles === 0 && (loadedMiles > 0 || deadheadMiles > 0)) {
               totalMiles = loadedMiles + deadheadMiles;
             }

             let finalLoadedMiles = loadedMiles;
             if (finalLoadedMiles === 0 && totalMiles > 0) {
               finalLoadedMiles = Math.max(0, totalMiles - deadheadMiles);
             }

             const grossRevenue = parseNumber(haul.grossRevenue ?? haul.revenue ?? haul.gross);
             let ratePerMileVal = parseNumber(haul.ratePerMile);
             if (ratePerMileVal === 0 && grossRevenue > 0 && finalLoadedMiles > 0) {
               ratePerMileVal = Number((grossRevenue / finalLoadedMiles).toFixed(4));
             }

             let totalOperatingCosts = parseNumber(haul.totalOperatingCosts ?? haul.expenses ?? haul.totalExpenses ?? haul.operatingCosts ?? haul.costs);
             let netProfit = parseNumber(haul.netProfit ?? haul.profit ?? haul.net);

             const fuelCosts = parseNumber(haul.fuelCosts);
             const fuelGallons = parseNumber(haul.fuelGallons);
             const maintenanceCosts = parseNumber(haul.maintenanceCosts);
             const foodCosts = parseNumber(haul.foodCosts);
             const tollCosts = parseNumber(haul.tollCosts);
             const miscCosts = parseNumber(haul.miscCosts);
             
             // Ensure total operating costs is at least the sum of children
             const milesPerGallon = parseNumber(haul.milesPerGallon ?? haul.avgMpg ?? haul.avgMPG ?? haul.mpg);
             let loadedMpg = parseNumber(haul.loadedMpg ?? haul.loadedMPG ?? haul.loadedmpg);
             let deadheadMpg = parseNumber(haul.deadheadMpg ?? haul.deadheadMPG ?? haul.deadheadmpg);
             
             const sumOfDetailedCosts = fuelCosts + maintenanceCosts + foodCosts + tollCosts + miscCosts;
             
             // If a valid netProfit is provided, strictly infer operating costs to ensure the math perfectly aligns.
             // This avoids OCR mapping errors where individual expenses or total operating costs are misread.
             if (netProfit !== 0 && grossRevenue !== 0) {
               const strictInferredCosts = Number((grossRevenue - netProfit).toFixed(2));
               // Only use this strictly inferred cost if it's broadly sensible (i.e. covers our known detailed costs, or we have none)
               if (strictInferredCosts >= sumOfDetailedCosts || sumOfDetailedCosts === 0) {
                 totalOperatingCosts = strictInferredCosts;
               } else {
                 totalOperatingCosts = sumOfDetailedCosts;
                 netProfit = grossRevenue - totalOperatingCosts;
               }
             } else if (sumOfDetailedCosts > totalOperatingCosts) {
               totalOperatingCosts = sumOfDetailedCosts;
             }

             if (netProfit === 0 && grossRevenue !== 0) {
               netProfit = grossRevenue - totalOperatingCosts;
             }

              const finalStatus = haul.status || 'Completed';

             const pickUpDateVal = haul.pickUpDate ?? haul.pickupDate ?? haul.pickup ?? haul.puDate ?? haul.pudate ?? '';
             const deliveryDateVal = haul.deliveryDate ?? haul.deliverydate ?? haul.delivery ?? haul.delDate ?? haul.deldate ?? '';
             const pickUpLocationVal = haul.pickUpLocation ?? haul.pickupLocation ?? haul.pickupSite ?? haul.origin ?? '';
             const deliveryLocationVal = haul.deliveryLocation ?? haul.deliverylocation ?? haul.deliverySite ?? haul.destination ?? '';

              const newHaul = {
                unitNumber: String(haul.unitNumber ?? haul.unit ?? '').trim(),
                unitType: String(haul.unitType ?? '').trim(),
                loadNumber: String(haul.loadNumber ?? haul.load ?? '').trim(),
                customerName: String(haul.customerName ?? haul.customer ?? '').trim(),
                pickUpDate: formatForInput(pickUpDateVal),
                milesPerGallon: milesPerGallon,
                loadedMpg: loadedMpg,
                deadheadMpg: deadheadMpg,
                loadedMiles: finalLoadedMiles,
                deadheadMiles: deadheadMiles,
                pickUpLocation: String(pickUpLocationVal).trim(),
                deliveryDate: formatForInput(deliveryDateVal),
                deliveryLocation: String(deliveryLocationVal).trim(),
                totalMiles: totalMiles,
                ratePerMile: ratePerMileVal,
                scaleWeight: parseNumber(haul.scaleWeight),
                grossWeight: parseNumber(haul.grossWeight),
                grossRevenue: grossRevenue,
                totalOperatingCosts: totalOperatingCosts,
                netProfit: netProfit,
                status: 'Active', // Always create as Active initially so expenses can be added
                ownerId: ownerId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              
              try {
                const newHaulRef = await addDoc(collection(db, path), newHaul);
                
                if (totalOperatingCosts > 0) {
                  let accountedCosts = 0;
                  
                  const addExpense = async (category: string, amount: number, vendor: string, gallons?: number) => {
                    if (amount > 0) {
                      accountedCosts += amount;
                      await addDoc(collection(db, path, newHaulRef.id, 'expenses'), {
                        haulId: newHaulRef.id,
                        category,
                        vendor,
                        amount,
                        gallons: gallons || (category === 'Fuel' ? 0 : null),
                        timestamp: new Date().toISOString(),
                        ownerId: ownerId,
                      });
                    }
                  };

                  await addExpense('Fuel', fuelCosts, 'Imported Fuel', fuelGallons);
                  await addExpense('Maintenance', maintenanceCosts, 'Imported Maintenance');
                  await addExpense('Food', foodCosts, 'Imported Food');
                  await addExpense('Toll', tollCosts, 'Imported Tolls');
                  await addExpense('Misc', miscCosts, 'Imported Misc');
                  
                  const remaining = totalOperatingCosts - accountedCosts;
                  if (remaining > 0.01 || remaining < -0.01) {
                    // Create entry for remainder
                    await addExpense('Misc', Math.max(0, remaining), 'Imported Remaining Expenses');
                  }
                }
                
                if (finalStatus === 'Completed') {
                  const { updateDoc, doc } = await import('firebase/firestore');
                  await updateDoc(doc(db, path, newHaulRef.id), {
                    status: 'Completed',
                    updatedAt: serverTimestamp()
                  });
                }
              } catch (innerErr) {
                 console.error('Failed to import row, skipped:', innerErr);
              }
          }
          
          alert(`Successfully imported ${haulsData.length} trips!`);
        } catch (error: any) {
          console.error(error);
          alert(`Error importing data: ${error.message || 'Check console for details'}.`);
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
       console.error(error);
       setIsImporting(false);
       if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: 'none' }} 
        accept=".pdf,.csv,.xlsx,.xls" 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
      >
        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        {isImporting ? 'Importing...' : 'Import'}
      </button>
    </>
  );
}

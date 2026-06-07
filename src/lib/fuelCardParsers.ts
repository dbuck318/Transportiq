import Papa from 'papaparse';
import { OCRResult } from '../types';

/**
 * Normalizes CSV exports from major fuel card providers.
 * Supports Comdata, EFS, and standard Fleet formats.
 */
export async function parseFuelCardCSV(file: File): Promise<OCRResult[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const transactions: OCRResult[] = results.data.map((row: any) => {
            // Attempt to find keys regardless of casing/spacing
            const findValue = (keys: string[]) => {
              const foundKey = Object.keys(row).find(k => 
                keys.some(search => k.toLowerCase().includes(search.toLowerCase()))
              );
              return foundKey ? row[foundKey] : null;
            };

            const vendor = findValue(['merchant', 'vendor', 'name', 'location']) || 'Unit Stop';
            const amountStr = findValue(['amount', 'net', 'total']) || '0';
            const gallonsStr = findValue(['gallons', 'qty', 'volume']) || '0';
            const dateStr = findValue(['date', 'time', 'timestamp']) || new Date().toISOString();

            return {
              vendor: String(vendor).toUpperCase(),
              amount: Math.abs(parseFloat(String(amountStr).replace(/[$,]/g, ''))),
              gallons: Math.abs(parseFloat(String(gallonsStr))),
              category: 'Fuel' as const,
              timestamp: new Date(dateStr).toISOString()
            };
          }).filter(t => t.amount > 0);
          
          resolve(transactions);
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(err)
    });
  });
}

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { Resend } from 'resend';
import cron from 'node-cron';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse, 
  generateAuthenticationOptions, 
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import * as XLSX from "xlsx";

dotenv.config();

// Load firebase-applet-config.json safely
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8')
);

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    const initOptions: any = {
      projectId: firebaseConfig.projectId,
    };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
       initOptions.credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    }
    initializeApp(initOptions);
  } catch (err) {
    console.warn("Firebase Admin failed to initialize. Admin features may be degraded.", err);
  }
}


const db = getApps().length ? getFirestore(firebaseConfig.firestoreDatabaseId) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Note: Admin SDK features (Biometrics, Admin Reporting) require FIREBASE_SERVICE_ACCOUNT_KEY 
// to be set in the .env file in order to have sufficient permissions to read/write to Firestore.

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Allow Google Sites, custom domains, and iframe embedding globally
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors *;"
  );
  // Remove conflicting legacy headers to allow framing in external frames
  res.removeHeader("X-Frame-Options");
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper for sending the weekly report
const sendAdminReport = async () => {
    if (!db || !resend) {
        console.error("Missing DB or Resend configuration for reports");
        return;
    }

    try {
        const usersSnap = await db.collection('users').orderBy('createdAt', 'desc').get();
        const adminsSnap = await db.collection('admins').get();
        
        const adminEmails = adminsSnap.docs.map(doc => doc.data().email).filter(Boolean);
        if (adminEmails.length === 0) return;

        const usersList = usersSnap.docs.map(doc => {
            const data = doc.data();
            return {
                email: data.email,
                name: data.displayName || 'Unnamed',
                joined: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'N/A'
            };
        });

        const htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
                <h1 style="color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Transport LogIQ: Weekly Fleet Digest</h1>
                <p>System status report for <strong>${new Date().toLocaleDateString()}</strong></p>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h2 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Operator Statistics</h2>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${usersList.length}</p>
                    <p style="font-size: 11px; color: #94a3b8; margin: 0;">Total Verified Accounts</p>
                </div>

                <h3 style="font-size: 12px; text-transform: uppercase; color: #94a3b8;">Operator Access Log (Cumulative)</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background: #f1f5f9; text-align: left;">
                            <th style="padding: 10px; border: 1px solid #e2e8f0;">Operator</th>
                            <th style="padding: 10px; border: 1px solid #e2e8f0;">Fleet Email</th>
                            <th style="padding: 10px; border: 1px solid #e2e8f0;">Registered</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${usersList.map(u => `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0;">${u.name}</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0;">${u.email}</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0;">${u.joined}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center;">Verified Secure Transport LogIQ Audit // Automated System Payload</p>
            </div>
        `;

        await resend.emails.send({
            from: 'Transport LogIQ Systems <onboarding@resend.dev>',
            to: adminEmails,
            subject: `Transport LogIQ Audit Engine: Weekly Fleet Digest - ${new Date().toLocaleDateString()}`,
            html: htmlContent
        });

        console.log("Weekly report sent successfully to", adminEmails);
    } catch (error) {
        console.error("Failed to send admin report:", error);
    }
};

// Schedule weekly report (Every Sunday at 23:59)
cron.schedule('59 23 * * 0', () => {
    console.log("Running scheduled weekly report...");
    sendAdminReport();
});

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    _ai = new GoogleGenAI({ 
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _ai;
}

// Cache for state fuel prices to avoid excessive AI API calls (12 hours)
const stateFuelPricesCache: Record<string, { gas: number, diesel: number, timestamp: number }> = {};
const routeStatesCache: Record<string, string[]> = {};
const CACHE_TTL = 12 * 60 * 60 * 1000;

// Helper to extract and parse JSON robustly from Gemini's output
function cleanAndParseJson(text: string | null | undefined): any {
  if (!text) {
    throw new Error("Empty response from AI");
  }
  const cleanText = text.trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Attempt block extraction to filter surrounding conversations/explanations
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0].trim());
      } catch (innerErr) {
        throw new Error(`Failed to parse extracted JSON block: ${(innerErr as Error).message}\nSource segment: ${jsonMatch[0]}`);
      }
    }
    throw e;
  }
}

app.post("/api/state-fuel-prices", async (req, res) => {
  try {
    const { states, origin, destination } = req.body;
    let finalStates: string[] = Array.isArray(states) ? states : [];

    if (origin && destination && origin.trim().length > 3 && destination.trim().length > 3) {
      const routeKey = `${origin.trim().toLowerCase()}_to_${destination.trim().toLowerCase()}`;
      if (routeStatesCache[routeKey]) {
        console.log(`Using cached route states for key: ${routeKey}`);
        finalStates = routeStatesCache[routeKey];
      } else {
        console.log(`Extracting route states for origin: ${origin}, destination: ${destination}`);
        try {
          const routePrompt = `You are a logistics routing coordinator. Identify the standard highway driving route from "${origin}" to "${destination}". Extract the exact sequence of 2-letter US state codes traversed along this route in order (including origin state and destination state). E.g. from Goshen, IN to Cleburne, TX, the traversed states are: ["IN", "IL", "MO", "AR", "TX"]. Format the output strictly as a JSON array of 2-letter state codes, e.g. ["IN", "IL", "MO", "AR", "TX"]. Do not include markdown formatting or backticks.`;

          const routeResponse = await getAI().models.generateContent({
            model: "gemini-3.7-flash",
            contents: routePrompt,
            config: {
              responseMimeType: "application/json"
            }
          });

          let routeText = typeof (routeResponse as any).text === 'function' ? (routeResponse as any).text() : routeResponse.text;
          console.log("Raw route states AI output:", routeText);
          
          const parsedRoute = cleanAndParseJson(routeText);
          if (Array.isArray(parsedRoute) && parsedRoute.length > 0) {
            finalStates = parsedRoute.map((st: any) => String(st).trim().toUpperCase()).filter(st => st.length === 2);
            routeStatesCache[routeKey] = finalStates;
          }
        } catch (err) {
          console.error("Failed to extract route states via Gemini:", err);
        }
      }
    }

    if (finalStates.length === 0) {
      return res.status(400).json({ error: "Missing states or origin/destination" });
    }

    // Filter missing/expired states
    const missingStates = finalStates.filter(st => {
      const cached = stateFuelPricesCache[st];
      return !cached || (Date.now() - cached.timestamp > CACHE_TTL);
    });

    if (missingStates.length > 0) {
      console.log(`Fetching live AAA prices for missing states: ${missingStates.join(", ")}`);
      try {
        const pricePrompt = `Use Google Search to find the EXACT, CURRENT, TODAY'S AAA (American Automobile Association) average regular gas and diesel prices for the following US states: ${missingStates.join(", ")}. 
        WARNING: Do not return historical 2022 data. You MUST return today's prices (around $3.00-$4.50 range). Format the output strictly as a JSON object where the keys are the 2-letter state abbreviations and the values are objects with "gas" and "diesel" numeric keys. Example: {"TX": {"gas": 2.99, "diesel": 3.89}}. Do not include any other text except the JSON, not even markdown backticks.`;
        
        const priceResponse = await getAI().models.generateContent({
          model: "gemini-3.7-flash",
          contents: pricePrompt,
          config: {
            tools: [{ googleSearch: {} }] // Use search grounding to get precise, real-time AAA prices
          }
        });
        
        let priceText = typeof (priceResponse as any).text === 'function' ? (priceResponse as any).text() : priceResponse.text;
        console.log("Raw live AAA prices AI output:", priceText);

        const parsedPrices = cleanAndParseJson(priceText);
        for (const st of missingStates) {
          if (parsedPrices[st] && parsedPrices[st].gas && parsedPrices[st].diesel) {
            stateFuelPricesCache[st] = {
              gas: Number(parsedPrices[st].gas),
              diesel: Number(parsedPrices[st].diesel),
              timestamp: Date.now()
            };
          }
        }
      } catch (err) {
        console.error("Failed to fetch live AAA prices via Gemini search:", err);
      }
    }

    const results: Record<string, { gas: number, diesel: number }> = {};
    for (const st of finalStates) {
      if (stateFuelPricesCache[st]) {
        results[st] = { gas: stateFuelPricesCache[st].gas, diesel: stateFuelPricesCache[st].diesel };
      } else {
        // Fallback to static averages if live lookup fails or is unavailable
        results[st] = { gas: 3.35, diesel: 3.85 };
      }
    }

    res.json({
      states: finalStates,
      prices: results
    });
  } catch (error: any) {
    console.error("Live Fuel Fetch Error:", error);
    res.status(500).json({ error: error.message });
  }
});
// API Routes
app.post("/api/admin/trigger-report", async (req, res) => {
    // In a real app, verify admin session here
    await sendAdminReport();
    res.json({ success: true });
});

app.post("/api/parse-receipt", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Missing image" });

    const response = await getAI().models.generateContent({
      model: "gemini-3.7-flash",
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: "Extract receipt details. Be extremely precise. If the receipt is for fuel and it ALSO registers Diesel Exhaust Fluid (DEF) alongside fuel, please extract the DEF portion separately and return it in the 'defItem' field. For example, if the total receipt is $150, which includes $130 in Fuel and $20 in DEF, the top-level amount should be 130 (category 'Fuel'), and 'defItem' should contain a separate object with category 'DEF' and amount 20 (and its corresponding gallons and pricePerGallon if available). Otherwise, set 'defItem' to null. Format as JSON with: vendor, timestamp (ISO), category (one of: Fuel, DEF, Maintenance, Food, Misc, Toll), amount (number), gallons (number, null if not fuel or DEF), pricePerGallon (number, null if not fuel or DEF), and optionally 'defItem' (with vendor, timestamp, category='DEF', amount, gallons, pricePerGallon)." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor: { type: Type.STRING },
            timestamp: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["Fuel", "DEF", "Maintenance", "Food", "Misc", "Toll"] },
            amount: { type: Type.NUMBER },
            gallons: { type: Type.NUMBER, nullable: true },
            pricePerGallon: { type: Type.NUMBER, nullable: true },
            defItem: {
              type: Type.OBJECT,
              properties: {
                vendor: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                category: { type: Type.STRING, enum: ["DEF"] },
                amount: { type: Type.NUMBER },
                gallons: { type: Type.NUMBER, nullable: true },
                pricePerGallon: { type: Type.NUMBER, nullable: true }
              },
              required: ["vendor", "amount", "category"],
              nullable: true
            }
          },
          required: ["vendor", "amount", "category"]
        }
      }
    });

    const outputText = response.text;
    const parsed = JSON.parse(outputText!);
    
    res.json(parsed);
  } catch (error: any) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/parse-document", async (req, res) => {
  try {
    const { documentBase64, mimeType } = req.body;
    if (!documentBase64) return res.status(400).json({ error: "Missing document" });

    const lowerMime = String(mimeType).toLowerCase();
    const isExcelOrCsv = lowerMime.includes("spreadsheetml") || 
                         lowerMime.includes("excel") || 
                         lowerMime.includes("csv") ||
                         lowerMime === "application/vnd.ms-excel";

    let response;

    if (isExcelOrCsv) {
      let combinedCsvText = "";
      try {
        const buffer = Buffer.from(documentBase64, 'base64');
        const workbook = XLSX.read(buffer, { 
          type: 'buffer',
          cellDates: true,
          dateNF: 'yyyy-mm-dd'
        });
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet, { dateNF: 'yyyy-mm-dd' });
          combinedCsvText += `Sheet: ${sheetName}\n${csv}\n\n`;
        });
      } catch (err: any) {
        console.error("Failed to parse document as modern spreadsheet:", err);
        return res.status(400).json({ error: "Could not parse spreadsheet file: " + err.message });
      }

      const promptText = `Extract all trips/hauls data from this spreadsheet data. YOU MUST EXTRACT EVERY SINGLE TRIP/HAUL ROW IN THE ENTIRE SPREADSHEET WITHOUT SKIPPING ANY. DO NOT STOP UNTIL EVERY ROW IS PROCESSED. Map the rows and columns to our target schema. Format as a JSON array of objects with the keys: unitNumber (string), unitType (string), loadNumber (string), customerName (string), pickUpDate (string), pickUpLocation (string), deliveryDate (string), deliveryLocation (string), totalMiles (number), loadedMiles (number), deadheadMiles (number), ratePerMile (number), scaleWeight (number), grossWeight (number), grossRevenue (number), totalOperatingCosts (number), fuelCosts (number), fuelGallons (number), maintenanceCosts (number), foodCosts (number), tollCosts (number), miscCosts (number), netProfit (number), milesPerGallon (number), loadedMpg (number), deadheadMpg (number). Use 0 for missing numbers and empty strings for missing strings. Skip "Total" or summary rows at the bottom that do not represent individual hauls, BUT DO NOT SKIP ANY REAL HAUL ROWS. If the spreadsheet has 15 rows of data for individual units, you MUST output an array with 15 objects.

CRITICAL SPREADSHEET / CSV COLUMN MAPPING RULES:
In more complex CSV/spreadsheet formats, columns may have diverse names. You must correctly map the headers as follows:
1. 'expenses', 'total expenses', 'operating costs', 'costs', 'exp' -> 'totalOperatingCosts'. 'fuel costs', 'fuel' -> 'fuelCosts'. 'tolls', 'toll' -> 'tollCosts'. 'maintenance', 'repairs' -> 'maintenanceCosts'. 'miscellaneous', 'misc' -> 'miscCosts'. 'food' -> 'foodCosts'. 'gallons', 'fuel gallons' -> 'fuelGallons'. SUM all extracted basic costs into 'totalOperatingCosts'.
2. 'avg MPG', 'avg_mpg', 'avg mpg', 'mpg', 'miles per gallon', or 'efficiency' -> map directly to 'loadedMpg' instead of 'milesPerGallon', unless explicitly specified as an overall average.
3. 'gross revenue', 'gross', 'revenue', 'gross_revenue', 'total revenue', 'gross amount', or 'amount' -> map directly to 'grossRevenue'.
4. 'net profit', 'net', 'profit', 'net_profit', 'net amount', 'earnings', 'net earnings', 'net revenue' -> map directly to 'netProfit'.
5. 'deliveryDate' can be found under 'Del Date', 'Delivery', 'Delivery Date', 'Date Completed', 'Date', 'End Date', 'Arr Date', 'Ship Date', 'Delivered Date', 'Delivered', 'Del. Date', 'Actual Delivery', 'Drop Date', 'Dropoff', 'Delivery Date & Time'.
6. 'pickUpDate' can be found under 'PU Date', 'Pick Up', 'Pickup Date', 'Start Date', 'Dept Date', 'Ship Date', 'Picked Up', 'PU', 'P/U', 'Load Date', 'Pickup', 'Orig Date', 'Origin Date', 'Pickup Date & Time'.
7. 'pickUpLocation' can be found under 'Origin', 'City', 'Pickup Location', 'Start', 'From', 'Location'.
8. 'deliveryLocation' can be found under 'Destination', 'Drop', 'Del Location', 'To', 'End'.
9. 'ratePerMile' can be found under 'Rate', 'RPM', 'Rate Per Mile', 'Rate/Mi'.
10. 'customerName' can be found under 'Customer', 'Broker', 'Broker Name', 'Company', 'Client', 'Shipper'.
11. 'totalMiles' can be found under 'Distance', 'Miles', 'Total Miles', 'Total Distance', 'Mileage'.
12. 'loadedMiles' can be found under 'Loaded', 'Loaded Miles', 'Loaded Distance'.
13. 'deadheadMiles' can be found under 'Deadhead', 'Empty', 'Empty Miles', 'DH'.

CRITICAL VALUE PARSING AND CLEANING RULES:
1. FINANCIAL & NUMERIC FIELDS: Strip out any currency symbols like '$', commas like in '1,500', percentage signs, and trailing units like 'mpg' or 'mi' before converting them into numbers. Ensure all monetary/profit values are represented cleanly as double/float decimals.
2. INFERRING COSTS: Map specific costs exactly as they appear in the columns to fuelCosts, tollCosts, maintenanceCosts, foodCosts, or miscCosts. Do NOT calculate or invent costs. If totalOperatingCosts is present, extract it directly. If netProfit is present, extract it directly. Do NOT recalculate them.
3. If 'totalMiles' is missing but 'loadedMiles' and 'deadheadMiles' are present, calculate 'totalMiles' as (loadedMiles + deadheadMiles).
4. DO NOT SUMMARIZE OR SHORTEN. YOU MUST PARSE OUT EVERY SINGLE ROW INTO A SEPARATE OBJECT IN THE JSON ARRAY. If there are 14 rows, there MUST be 14 objects in the returned JSON array.

CRITICAL DATE FORMATTING RULES:
1. Convert all extracted pickUpDate and deliveryDate values into the standard 'YYYY-MM-DD' format (e.g., '2026-05-18').
2. If only a month and day are present (e.g. '5/18' or 'May 18'), assume the current year 2026.
3. Support standard formats (MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD) and verbal formats (e.g. 'May 18, 2026', '18-May-26').
4. If no date can be found at all in a row, use an empty string. Do not invent or default a date if the document does not contain one.

CRITICAL PRECISION RULES FOR IDENTIFIER TRANSCRIBING:
1. Unit numbers (e.g. unitNumber) and load numbers (e.g. loadNumber) MUST be transcribed with extreme letter-for-letter and digit-for-digit fidelity. DO NOT guess, modify, or inject artificial characters (for example, do NOT write 'W90/144' if the document shows 'W90144' or splits it slightly over a line, merge them cleanly into the exact source value 'W90144').
2. Do NOT confuse similar digits (such as '7' and '2', '0' and '8', or '1' and '7'). Read letter-by-letter, digit-by-digit, to guarantee precise tracking. Ensure '027725' vs '027231' are read with maximum digital accuracy.

SPREADSHEET DATA CONTENT:
[START DATA]
${combinedCsvText}
[END DATA]`;

      response = await getAI().models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: promptText,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                unitNumber: { type: Type.STRING },
                unitType: { type: Type.STRING },
                loadNumber: { type: Type.STRING },
                customerName: { type: Type.STRING },
                pickUpDate: { type: Type.STRING },
                pickUpLocation: { type: Type.STRING },
                deliveryDate: { type: Type.STRING },
                deliveryLocation: { type: Type.STRING },
                totalMiles: { type: Type.NUMBER },
                loadedMiles: { type: Type.NUMBER },
                deadheadMiles: { type: Type.NUMBER },
                ratePerMile: { type: Type.NUMBER },
                scaleWeight: { type: Type.NUMBER },
                grossWeight: { type: Type.NUMBER },
                grossRevenue: { type: Type.NUMBER },
                totalOperatingCosts: { type: Type.NUMBER },
                fuelCosts: { type: Type.NUMBER },
                fuelGallons: { type: Type.NUMBER },
                maintenanceCosts: { type: Type.NUMBER },
                foodCosts: { type: Type.NUMBER },
                tollCosts: { type: Type.NUMBER },
                miscCosts: { type: Type.NUMBER },
                netProfit: { type: Type.NUMBER },
                milesPerGallon: { type: Type.NUMBER },
                loadedMpg: { type: Type.NUMBER },
                deadheadMpg: { type: Type.NUMBER }
              }
            }
          }
        }
      });
    } else {
      response = await getAI().models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { data: documentBase64, mimeType } },
            { text: `Extract all trips/hauls data from this document. YOU MUST EXTRACT EVERY SINGLE TRIP/HAUL ROW IN THE ENTIRE DOCUMENT WITHOUT SKIPPING ANY. DO NOT STOP UNTIL EVERY ROW IS PROCESSED. Map the information to our target schema. Format as a JSON array of objects with the keys: unitNumber (string), unitType (string), loadNumber (string), customerName (string), pickUpDate (string), pickUpLocation (string), deliveryDate (string), deliveryLocation (string), totalMiles (number), loadedMiles (number), deadheadMiles (number), ratePerMile (number), scaleWeight (number), grossWeight (number), grossRevenue (number), totalOperatingCosts (number), fuelCosts (number), fuelGallons (number), maintenanceCosts (number), foodCosts (number), tollCosts (number), miscCosts (number), netProfit (number), milesPerGallon (number), loadedMpg (number), deadheadMpg (number). Use 0 for missing numbers and empty strings for missing strings. Skip "Total" or summary rows at the bottom that do not represent individual hauls.

CRITICAL VALUE PARSING AND CLEANING RULES:
1. FINANCIAL & NUMERIC FIELDS: Strip out any currency symbols like '$', commas like in '1,500', percentage signs, and trailing units like 'mpg' or 'mi' before converting them into numbers. Ensure all monetary/profit values are represented cleanly as double/float decimals.
2. INFERRING COSTS: Map specific costs exactly as they appear in the columns to fuelCosts, tollCosts, maintenanceCosts, foodCosts, or miscCosts. Do NOT calculate or invent costs. If totalOperatingCosts is present, extract it directly. If netProfit is present, extract it directly. Do NOT recalculate them.
3. If 'totalMiles' is missing but 'loadedMiles' and 'deadheadMiles' are present, calculate 'totalMiles' as (loadedMiles + deadheadMiles).
4. DO NOT SUMMARIZE OR SHORTEN. YOU MUST PARSE OUT EVERY SINGLE ROW INTO A SEPARATE OBJECT IN THE JSON ARRAY. If there are 14 rows, there MUST be 14 objects in the returned JSON array.
5. 'pickUpLocation' can be found under 'Origin', 'City', 'Pickup Location', 'Start', 'From', 'Location'.
6. 'deliveryLocation' can be found under 'Destination', 'Drop', 'Del Location', 'To', 'End'.
7. 'customerName' can be found under 'Customer', 'Broker', 'Broker Name', 'Company', 'Client', 'Shipper'.
8. 'totalMiles' can be found under 'Distance', 'Miles', 'Total Miles', 'Total Distance', 'Mileage'.
9. 'loadedMiles' can be found under 'Loaded', 'Loaded Miles', 'Loaded Distance'.
10. 'deadheadMiles' can be found under 'Deadhead', 'Empty', 'Empty Miles', 'DH'.

CRITICAL DATE FORMATTING RULES (MANDATORY):
1. Convert ALL extracted pickUpDate and deliveryDate values STRICTLY into the standard 'YYYY-MM-DD' format (e.g., '2026-05-18').
2. If only a month and day are present (e.g. '5/18' or 'May 18'), assume the current year 2026.
3. Support standard formats (MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD) and verbal formats (e.g. 'May 18, 2026', '18-May-26').
4. If no date can be found at all in a row, use an empty string. Do not invent a date.

CRITICAL PRECISION RULES FOR IDENTIFIER TRANSCRIBING:
1. Unit numbers (e.g. unitNumber) and load numbers (e.g. loadNumber) MUST be transcribed with extreme letter-for-letter and digit-for-digit fidelity. DO NOT guess, modify, or inject artificial characters.
2. Do NOT confuse similar digits (such as '7' and '2', '0' and '8', or '1' and '7'). Read letter-by-letter, digit-by-digit, to guarantee precise tracking.` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                unitNumber: { type: Type.STRING },
                unitType: { type: Type.STRING },
                loadNumber: { type: Type.STRING },
                customerName: { type: Type.STRING },
                pickUpDate: { type: Type.STRING },
                pickUpLocation: { type: Type.STRING },
                deliveryDate: { type: Type.STRING },
                deliveryLocation: { type: Type.STRING },
                totalMiles: { type: Type.NUMBER },
                loadedMiles: { type: Type.NUMBER },
                deadheadMiles: { type: Type.NUMBER },
                ratePerMile: { type: Type.NUMBER },
                scaleWeight: { type: Type.NUMBER },
                grossWeight: { type: Type.NUMBER },
                grossRevenue: { type: Type.NUMBER },
                totalOperatingCosts: { type: Type.NUMBER },
                fuelCosts: { type: Type.NUMBER },
                fuelGallons: { type: Type.NUMBER },
                maintenanceCosts: { type: Type.NUMBER },
                foodCosts: { type: Type.NUMBER },
                tollCosts: { type: Type.NUMBER },
                miscCosts: { type: Type.NUMBER },
                netProfit: { type: Type.NUMBER },
                milesPerGallon: { type: Type.NUMBER },
                loadedMpg: { type: Type.NUMBER },
                deadheadMpg: { type: Type.NUMBER }
              }
            }
          }
        }
      });
    }

    const outputText = response.text;
    res.json(JSON.parse(outputText!));
  } catch (error: any) {
    console.error("Document Parsing Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ... (existing code, insert routes before startServer)

const rpName = 'Transport LogIQ Management';
const defaultRpID = process.env.NODE_ENV === 'production' ? 'ais-dev-uvxwhxqjvnly3ev7ykpmth-333377435528.us-east1.run.app' : 'localhost';
const defaultOrigin = process.env.NODE_ENV === 'production' ? `https://${defaultRpID}` : `http://${defaultRpID}:3000`;

function getRequestAuthContext(req: any) {
  const hostHeader = req.headers.host || '';
  const originHeader = req.headers.origin || '';
  const refererHeader = req.headers.referer || '';

  // Determine origin
  let effectiveOrigin = defaultOrigin;
  if (originHeader) {
    effectiveOrigin = originHeader;
  } else if (refererHeader) {
    try {
      effectiveOrigin = new URL(refererHeader).origin;
    } catch (e) {}
  } else if (hostHeader) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    effectiveOrigin = `${protocol}://${hostHeader}`;
  }

  // Determine rpID
  let effectiveRpID = defaultRpID;
  try {
    effectiveRpID = new URL(effectiveOrigin).hostname;
  } catch (e) {}

  return { origin: effectiveOrigin, rpID: effectiveRpID };
}

const getVersion = () => {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return `v${pkg.version}`;
    }
  } catch (e) {}
  try {
    const versionPath = path.resolve(process.cwd(), 'version.txt');
    if (fs.existsSync(versionPath)) {
      return fs.readFileSync(versionPath, 'utf8').trim();
    }
  } catch (err) {
    console.warn("Could not read version.txt:", err);
  }
  return 'v1.5.56';
};

const SERVER_START_TIME = Date.now().toString();

app.get("/api/version", (req, res) => {
  res.json({ version: getVersion(), startupId: SERVER_START_TIME });
});

app.get("/api/community-hauls-summary", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB not initialized" });
  try {
    const usersSnap = await db.collection('users').get();
    const userProfiles: Record<string, any> = {};
    usersSnap.forEach((uDoc: any) => {
      userProfiles[uDoc.id] = uDoc.data();
    });

    const snap = await db.collection('hauls')
      .where('status', 'in', ['Completed', 'Finalized'])
      .get();
      
    const summaries: any[] = [];
    snap.forEach((docSnap: any) => {
      const data = docSnap.data();
      const ownerId = data.ownerId || '';
      const profile = userProfiles[ownerId] || {};
      
      // Ensure we have loadedMpg or general milesPerGallon, prioritizing loaded
      const loadedMpg = Number(data.loadedMpg || data.milesPerGallon || 0);
      if (loadedMpg > 0) {
        summaries.push({
          id: docSnap.id,
          ownerId,
          loadedMpg,
          scaleWeight: Number(data.scaleWeight || 0),
          grossWeight: Number(data.grossWeight || 0),
          unitType: data.unitType || '',
          unitLength: Number(data.unitLength || 0),
          pickUpLocation: data.pickUpLocation || '',
          deliveryLocation: data.deliveryLocation || '',
          axles: Number(data.axles || 0),
          powerUnitYear: profile.powerUnitYear ? Number(profile.powerUnitYear) : '',
          powerUnitMake: profile.powerUnitMake || '',
          powerUnitModel: profile.powerUnitModel || '',
          engineType: profile.engineType || '',
          duallyOrSrw: profile.duallyOrSrw || '',
          drivetrain: profile.drivetrain || '',
          powerUnitScaleWeight: profile.powerUnitScaleWeight ? Number(profile.powerUnitScaleWeight) : '',
          powerUnitWheelbase: profile.powerUnitWheelbase || '',
          fuelType: profile.fuelType || ''
        });
      }
    });
    res.json({ hauls: summaries });
  } catch (error: any) {
    console.warn("Could not fetch community hauls summary due to permission/credential limits. Gracefully continuing with an empty list.", error.message || error);
    res.json({ hauls: [], warning: "Missing or insufficient DB permissions on server" });
  }
});

// Registration
app.post('/api/auth/generate-registration-options', async (req, res) => {
  const { email, userId, displayName } = req.body;
  if (!db) return res.status(500).json({ error: "DB not initialized" });

  const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  // Get existing authenticators
  const authenticatorsSnap = await db.collection('authenticators').where('userId', '==', userId).get();
  const excludeCredentials = authenticatorsSnap.docs.map(doc => ({
    id: doc.id,
    type: 'public-key' as const,
    transports: doc.data().transports,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: reqRpID,
    userID: isoUint8Array.fromUTF8String(userId),
    userName: email,
    userDisplayName: displayName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });

  // Store the current challenge temporarily (in a real app, use a session or Redis)
  // For simplicity in this agent, we'll store it in a 'challenges' collection
  await db.collection('challenges').doc(userId).set({
    challenge: options.challenge,
    type: 'registration',
    timestamp: FieldValue.serverTimestamp()
  });

  res.json(options);
});

app.post('/api/auth/verify-registration', async (req, res) => {
  const { body, userId } = req.body;
  if (!db) return res.status(500).json({ error: "DB not initialized" });

  const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

  const challengeSnap = await db.collection('challenges').doc(userId).get();
  if (!challengeSnap.exists) return res.status(400).json({ error: "Challenge not found" });
  
  const expectedChallenge = challengeSnap.data()?.challenge;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: reqOrigin,
      expectedRPID: reqRpID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo as any;

      const newAuthenticator = {
        credentialID: credential.id,
        credentialPublicKey: isoUint8Array.toHex(credential.publicKey),
        counter: credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        userId,
        transports: (body as any).response.transports,
      };

      await db.collection('authenticators').doc(credential.id).set(newAuthenticator);
      await db.collection('challenges').doc(userId).delete();
      
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: "Verification failed" });
    }
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Authentication
app.post('/api/auth/generate-authentication-options', async (req, res) => {
  const { email } = req.body;
  if (!db) return res.status(500).json({ error: "DB not initialized" });

  const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

  // Find user by email
  const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (userSnap.empty) return res.status(404).json({ error: "User not found" });
  
  const userId = userSnap.docs[0].id;
  const authenticatorsSnap = await db.collection('authenticators').where('userId', '==', userId).get();
  
  const allowCredentials = authenticatorsSnap.docs.map(doc => ({
    id: doc.data().credentialID,
    type: 'public-key' as const,
    transports: doc.data().transports,
  }));

  const options = await generateAuthenticationOptions({
    rpID: reqRpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  await db.collection('challenges').doc(userId).set({
    challenge: options.challenge,
    type: 'authentication',
    timestamp: FieldValue.serverTimestamp()
  });

  res.json({ options, userId });
});

app.post('/api/auth/verify-authentication', async (req, res) => {
  const { body, userId } = req.body;
  if (!db) return res.status(500).json({ error: "DB not initialized" });

  const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

  const challengeSnap = await db.collection('challenges').doc(userId).get();
  const expectedChallenge = challengeSnap.data()?.challenge;

  const authSnap = await db.collection('authenticators').doc(body.id).get();
  if (!authSnap.exists) return res.status(404).json({ error: "Authenticator not found" });
  
  const authenticator = authSnap.data();

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: reqOrigin,
      expectedRPID: reqRpID,
      credential: {
        id: authenticator?.credentialID,
        publicKey: isoUint8Array.fromHex(authenticator?.credentialPublicKey),
        counter: authenticator?.counter as any,
        transports: authenticator?.transports,
      },
      requireUserVerification: false,
    });

    if (verification.verified) {
      // Update counter
      await db.collection('authenticators').doc(body.id).update({
        counter: verification.authenticationInfo.newCounter,
      });
      await db.collection('challenges').doc(userId).delete();
      
      // Generate a custom token for Firebase login
      const customToken = await getAuth().createCustomToken(userId);
      res.json({ verified: true, customToken });
    } else {
      res.status(400).json({ error: "Verification failed" });
    }
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

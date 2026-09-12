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
const PORT = 3000;

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

// Endpoint: Submit Operator Feedback & Dispatch Email
app.post("/api/feedback", async (req, res) => {
  try {
    const { email, feedback, category, userDisplayName, userId } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      return res.status(400).json({ error: "Please enter your feedback before submitting." });
    }

    const trimmedEmail = email.trim();
    const trimmedFeedback = feedback.trim();
    const feedbackCategory = (typeof category === 'string' && category.trim()) ? category.trim() : "General Feedback";
    const timestamp = new Date();

    const formattedDate = `${timestamp.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'medium'
    })} (${timestamp.toUTCString()})`;

    // Build clean HTML email formatted for easy reading
    const sanitizedFeedback = trimmedFeedback
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transport LogIQ Feedback</title>
</head>
<body style="margin:0;padding:24px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
    <!-- Header Banner -->
    <div style="background:linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);padding:28px 32px;color:#ffffff;">
      <div style="display:inline-block;padding:4px 12px;background:rgba(255,255,255,0.18);border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">
        Transport LogIQ Management Portal
      </div>
      <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
        Transport LogIQ Feedback
      </h1>
      <p style="margin:0;font-size:13px;color:#bfdbfe;">
        New feedback submission received from operator
      </p>
    </div>

    <!-- Metadata Card -->
    <div style="padding:28px 32px;">
      <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:24px;border:1px solid #e2e8f0;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-weight:600;width:130px;vertical-align:top;">Operator Email:</td>
            <td style="padding:6px 0;color:#0f172a;font-weight:700;">
              <a href="mailto:${trimmedEmail}" style="color:#2563eb;text-decoration:none;">${trimmedEmail}</a>
            </td>
          </tr>
          ${userDisplayName ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-weight:600;vertical-align:top;">Display Name:</td>
            <td style="padding:6px 0;color:#0f172a;font-weight:600;">${userDisplayName}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-weight:600;vertical-align:top;">Category:</td>
            <td style="padding:6px 0;color:#0f172a;">
              <span style="display:inline-block;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:6px;font-weight:700;font-size:12px;">
                ${feedbackCategory}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-weight:600;vertical-align:top;">Submitted At:</td>
            <td style="padding:6px 0;color:#475569;">${formattedDate}</td>
          </tr>
          ${userId ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-weight:600;vertical-align:top;">Account UID:</td>
            <td style="padding:6px 0;color:#64748b;font-family:monospace;font-size:12px;">${userId}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Feedback Content Box -->
      <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#475569;margin:0 0 10px 0;">
        Feedback & Comments
      </h2>
      <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:12px;padding:20px;font-size:15px;line-height:1.65;color:#0f172a;white-space:pre-wrap;word-break:break-word;">${sanitizedFeedback}</div>

      <!-- Quick Reply Banner -->
      <div style="margin-top:20px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;font-size:13px;color:#1e40af;">
        <strong>Direct Reply:</strong> Hitting reply to this email will respond directly to <a href="mailto:${trimmedEmail}" style="color:#1d4ed8;font-weight:700;">${trimmedEmail}</a>.
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0;padding:16px 32px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;">
      Transport LogIQ Automated Feedback Notification System &bull; Confidential
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
TRANSPORT LOGIQ FEEDBACK
==============================================

Operator Email: ${trimmedEmail}
${userDisplayName ? `Display Name:   ${userDisplayName}\n` : ''}Category:       ${feedbackCategory}
Submitted At:   ${formattedDate}
${userId ? `Account UID:    ${userId}\n` : ''}
----------------------------------------------
FEEDBACK:
----------------------------------------------

${trimmedFeedback}

----------------------------------------------
Direct reply to this email will respond to: ${trimmedEmail}
==============================================
    `.trim();

    // 1. Persist feedback locally to data/feedbacks.json
    try {
      const feedbackDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
      }
      const feedbackFilePath = path.join(feedbackDir, 'feedbacks.json');
      let existingFeedbacks: any[] = [];
      if (fs.existsSync(feedbackFilePath)) {
        try {
          existingFeedbacks = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf8'));
        } catch {}
      }
      existingFeedbacks.unshift({
        id: 'fb_' + Date.now(),
        email: trimmedEmail,
        feedback: trimmedFeedback,
        category: feedbackCategory,
        userDisplayName: userDisplayName || null,
        userId: userId || null,
        createdAt: timestamp.toISOString()
      });
      fs.writeFileSync(feedbackFilePath, JSON.stringify(existingFeedbacks, null, 2), 'utf8');
    } catch (e) {
      console.warn("Failed to write to data/feedbacks.json:", e);
    }

    // 2. Mirror to Firestore if available
    if (db) {
      try {
        await db.collection('feedbacks').add({
          email: trimmedEmail,
          feedback: trimmedFeedback,
          category: feedbackCategory,
          userDisplayName: userDisplayName || null,
          userId: userId || null,
          createdAt: new Date()
        });
      } catch (dbErr) {
        console.warn("Could not mirror feedback to Firestore:", dbErr);
      }
    }

    // 3. Dispatch Email to support@transportlogic.com
    let emailSent = false;
    let emailError: string | null = null;

    if (resend) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Transport LogIQ Feedback <onboarding@resend.dev>';
        const result = await resend.emails.send({
          from: fromEmail,
          to: ['support@transportlogic.com'],
          replyTo: trimmedEmail,
          subject: 'Transport LogIQ Feedback',
          html: htmlContent,
          text: textContent
        });
        console.log("Feedback email sent successfully via Resend:", result);
        emailSent = true;
      } catch (sendErr: any) {
        console.error("Resend feedback email dispatch failed:", sendErr);
        emailError = sendErr?.message || String(sendErr);
      }
    } else {
      console.warn("Resend client not initialized (RESEND_API_KEY missing)");
      emailError = "Resend API key not configured on server";
    }

    return res.json({
      success: true,
      emailSent,
      emailError,
      message: "Feedback recorded successfully."
    });
  } catch (err: any) {
    console.error("Unexpected error in /api/feedback:", err);
    return res.status(500).json({ error: err.message || "Failed to process feedback submission." });
  }
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

// --- Biometric Passkey / WebAuthn Storage & Helpers ---
const AUTHENTICATORS_FILE = path.resolve(process.cwd(), 'data', 'authenticators.json');

interface StoredAuthenticator {
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  credentialDeviceType?: string;
  credentialBackedUp?: boolean;
  userId: string;
  email?: string;
  displayName?: string;
  transports?: string[];
  createdAt: string;
}

function loadAuthenticators(): StoredAuthenticator[] {
  try {
    if (fs.existsSync(AUTHENTICATORS_FILE)) {
      const data = fs.readFileSync(AUTHENTICATORS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("Could not read authenticators file, starting empty:", err);
  }
  return [];
}

function saveAuthenticators(authenticators: StoredAuthenticator[]) {
  try {
    const dataDir = path.dirname(AUTHENTICATORS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(AUTHENTICATORS_FILE, JSON.stringify(authenticators, null, 2), 'utf8');
  } catch (err) {
    console.error("Could not save authenticators:", err);
  }
}

// In-memory challenge store with auto-expiry (5 minutes)
interface StoredChallenge {
  challenge: string;
  type: 'registration' | 'authentication';
  userId?: string;
  email?: string;
  timestamp: number;
}
const authChallenges = new Map<string, StoredChallenge>();

// Clean up stale challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of authChallenges.entries()) {
    if (now - val.timestamp > 5 * 60 * 1000) {
      authChallenges.delete(key);
    }
  }
}, 60 * 1000);

// --- Biometric Authentication API Endpoints ---

// Check biometric status for a user
app.get('/api/auth/biometric-status/:email', (req, res) => {
  try {
    const email = req.params.email;
    if (!email) return res.json({ hasBiometrics: false, count: 0 });
    const all = loadAuthenticators();
    const userAuths = all.filter(a => a.email && a.email.toLowerCase() === email.toLowerCase());
    res.json({ hasBiometrics: userAuths.length > 0, count: userAuths.length });
  } catch (err: any) {
    res.json({ hasBiometrics: false, count: 0 });
  }
});

// Registration: 1. Generate registration options
app.post('/api/auth/generate-registration-options', async (req, res) => {
  try {
    const { email, userId, displayName } = req.body || {};
    if (!userId || !email) {
      return res.status(400).json({ error: "Missing required fields (userId, email)" });
    }

    const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

    // Get existing authenticators to exclude them from registration
    const allAuthenticators = loadAuthenticators();
    const userAuthenticators = allAuthenticators.filter(a => a.userId === userId);
    const excludeCredentials = userAuthenticators.map(a => ({
      id: a.credentialID,
      type: 'public-key' as const,
      transports: a.transports as any,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID: reqRpID,
      userID: isoUint8Array.fromUTF8String(userId),
      userName: email,
      userDisplayName: displayName || email,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    authChallenges.set(userId, {
      challenge: options.challenge,
      type: 'registration',
      userId,
      email,
      timestamp: Date.now()
    });

    res.json(options);
  } catch (error: any) {
    console.error("Error in generate-registration-options:", error);
    res.status(500).json({ error: error?.message || "Failed to generate registration options" });
  }
});

// Registration: 2. Verify registration response
app.post('/api/auth/verify-registration', async (req, res) => {
  try {
    const { body, userId, email, displayName } = req.body || {};
    if (!body || !userId) {
      return res.status(400).json({ error: "Missing registration payload or userId" });
    }

    const challengeData = authChallenges.get(userId);
    if (!challengeData || challengeData.type !== 'registration') {
      return res.status(400).json({ error: "Registration session expired or not found. Please try again." });
    }

    const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: reqOrigin,
      expectedRPID: reqRpID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo as any;

      const newAuth: StoredAuthenticator = {
        credentialID: credential.id,
        credentialPublicKey: isoUint8Array.toHex(credential.publicKey),
        counter: credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        userId,
        email: email || challengeData.email || '',
        displayName: displayName || '',
        transports: (body as any)?.response?.transports,
        createdAt: new Date().toISOString()
      };

      const all = loadAuthenticators();
      const existingIdx = all.findIndex(a => a.credentialID === credential.id);
      if (existingIdx >= 0) {
        all[existingIdx] = newAuth;
      } else {
        all.push(newAuth);
      }
      saveAuthenticators(all);

      authChallenges.delete(userId);

      // Best effort mirror to Firestore if admin credentials exist
      if (db) {
        try {
          await db.collection('authenticators').doc(credential.id).set(newAuth);
        } catch (e) {
          // Ignored if permissions are restricted in development
        }
      }

      res.json({ verified: true });
    } else {
      res.status(400).json({ error: "Verification failed. Could not verify biometric credential." });
    }
  } catch (error: any) {
    console.error("Error in verify-registration:", error);
    res.status(400).json({ error: error?.message || "Biometric registration verification error" });
  }
});

// Authentication: 1. Generate authentication options
app.post('/api/auth/generate-authentication-options', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Email is required to prepare biometric sign-in" });
    }

    const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

    const all = loadAuthenticators();
    const userAuthenticators = all.filter(a => a.email && a.email.toLowerCase() === email.trim().toLowerCase());

    if (userAuthenticators.length === 0) {
      return res.status(404).json({ error: "No biometric credentials found for this account. Please sign in with your email and password first, then enable Biometrics in Settings." });
    }

    const userId = userAuthenticators[0].userId;

    const options = await generateAuthenticationOptions({
      rpID: reqRpID,
      allowCredentials: userAuthenticators.map(a => ({
        id: a.credentialID,
        type: 'public-key' as const,
        transports: a.transports as any,
      })),
      userVerification: 'preferred',
    });

    authChallenges.set(userId, {
      challenge: options.challenge,
      type: 'authentication',
      userId,
      email,
      timestamp: Date.now()
    });

    res.json({ options, userId });
  } catch (error: any) {
    console.error("Error in generate-authentication-options:", error);
    res.status(500).json({ error: error?.message || "Failed to generate authentication options" });
  }
});

// Authentication: 2. Verify authentication response
app.post('/api/auth/verify-authentication', async (req, res) => {
  try {
    const { body, userId } = req.body || {};
    if (!body || !userId) {
      return res.status(400).json({ error: "Missing authentication payload or userId" });
    }

    const challengeData = authChallenges.get(userId);
    if (!challengeData || challengeData.type !== 'authentication') {
      return res.status(400).json({ error: "Authentication challenge expired. Please try again." });
    }

    const all = loadAuthenticators();
    const authenticator = all.find(a => a.credentialID === body.id);
    if (!authenticator) {
      return res.status(404).json({ error: "Biometric key not found. Please re-register in Settings." });
    }

    const { origin: reqOrigin, rpID: reqRpID } = getRequestAuthContext(req);

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: reqOrigin,
      expectedRPID: reqRpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: isoUint8Array.fromHex(authenticator.credentialPublicKey),
        counter: authenticator.counter,
        transports: authenticator.transports as any,
      },
      requireUserVerification: false,
    });

    if (verification.verified) {
      authenticator.counter = verification.authenticationInfo.newCounter;
      saveAuthenticators(all);
      authChallenges.delete(userId);

      // Attempt custom token creation if Firebase Admin credential exists
      let customToken: string | null = null;
      try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          customToken = await getAuth().createCustomToken(userId);
        }
      } catch (tokenErr) {
        console.warn("Custom token generation omitted (requires Firebase service account):", tokenErr);
      }

      res.json({ 
        verified: true, 
        userId,
        email: authenticator.email,
        customToken 
      });
    } else {
      res.status(400).json({ error: "Biometric authentication failed. The signature could not be verified." });
    }
  } catch (error: any) {
    console.error("Error in verify-authentication:", error);
    res.status(400).json({ error: error?.message || "Biometric authentication error" });
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === "production";

  // Explicitly serve Service Worker and related scripts with application/javascript MIME type
  app.get('/sw.js', (req, res) => {
    const swDist = path.join(process.cwd(), 'dist', 'sw.js');
    if (fs.existsSync(swDist)) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.sendFile(swDist);
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.send('// Dev Service Worker\nself.addEventListener("install", () => self.skipWaiting());\nself.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));\n');
  });

  app.get(/^\/workbox-[a-f0-9]+\.js$/, (req, res) => {
    const wbDist = path.join(process.cwd(), 'dist', req.path.replace(/^\//, ''));
    if (fs.existsSync(wbDist)) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.sendFile(wbDist);
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.send('// workbox dev stub\n');
  });

  // Global API error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("API Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({ error: err.message || "An unexpected error occurred" });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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

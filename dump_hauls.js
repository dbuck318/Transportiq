import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8')
);

const initOptions = {
  projectId: firebaseConfig.projectId,
};

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  initOptions.credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
}

initializeApp(initOptions);
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function main() {
  const snap = await db.collection('hauls').get();
  console.log(`Found ${snap.size} total hauls:`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Unit: ${data.unitNumber} | U2: ${data.unitNumber2} | U3: ${data.unitNumber3} | Load: ${data.loadNumber} | Cust: ${data.customerName} | PickDate: ${data.pickUpDate} | Status: ${data.status} | GrossRev: ${data.grossRevenue} | TotalMiles: ${data.totalMiles}`);
  });
}

main().catch(console.error);

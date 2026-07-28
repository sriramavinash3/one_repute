require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/firebase');

async function seed() {
  const db = getDb();
  console.log('Connected to Firebase.');

  // Read mock data from frontend
  const mockDataPath = path.join(__dirname, '../../frontend/src/config/mockData.js');
  let mockDataStr = fs.readFileSync(mockDataPath, 'utf8');
  
  // Quick and dirty ES module to CommonJS conversion for this specific file
  mockDataStr = mockDataStr.replace(/export const /g, 'const ');
  mockDataStr += '\nmodule.exports = { MOCK_CUSTOMERS, MOCK_OUTLETS, MOCK_REVIEWS };\n';
  
  const tempFile = path.join(__dirname, 'tempMockData.js');
  fs.writeFileSync(tempFile, mockDataStr);
  
  const { MOCK_CUSTOMERS, MOCK_OUTLETS, MOCK_REVIEWS } = require('./tempMockData.js');

  console.log(`Loaded ${MOCK_CUSTOMERS.length} customers, ${MOCK_OUTLETS.length} outlets, ${MOCK_REVIEWS.length} reviews.`);

  // Wipe data
  const wipeCollection = async (collectionName) => {
    console.log(`Wiping ${collectionName}...`);
    const snap = await db.collection(collectionName).get();
    let count = 0;
    
    // Firestore batch limit is 500
    let batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (count % 400 !== 0) {
      await batch.commit();
    }
    
    console.log(`Deleted ${snap.size} documents from ${collectionName}.`);
  };

  await wipeCollection('customers');
  await wipeCollection('outlets');
  await wipeCollection('reviews');

  // Seed data
  const seedCollection = async (collectionName, dataArray) => {
    console.log(`Seeding ${collectionName}...`);
    let count = 0;
    let batch = db.batch();
    
    for (const item of dataArray) {
      const ref = db.collection(collectionName).doc(item.id);
      
      // Convert mock 'seconds' timestamps to real Firestore Timestamps or JS Dates
      const cleanItem = { ...item };
      Object.keys(cleanItem).forEach(key => {
        if (cleanItem[key] && typeof cleanItem[key] === 'object' && cleanItem[key].seconds) {
          cleanItem[key] = new Date(cleanItem[key].seconds * 1000);
        }
      });
      
      batch.set(ref, cleanItem);
      count++;
      
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (count % 400 !== 0) {
      await batch.commit();
    }
    
    console.log(`Inserted ${dataArray.length} documents into ${collectionName}.`);
  };

  await seedCollection('customers', MOCK_CUSTOMERS);
  await seedCollection('outlets', MOCK_OUTLETS);
  await seedCollection('reviews', MOCK_REVIEWS);

  fs.unlinkSync(tempFile);
  console.log('Database seeded successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

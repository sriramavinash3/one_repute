const admin = require('firebase-admin');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { getDb } = require('./config/firebase');
const openaiService = require('./services/openaiService');

async function run() {
  const db = getDb();
  console.log("Fetching reviews for outlet...");
  const snap = await db.collection('reviews').where('outletId', '==', '6NyoaUfjshfe4WlgFbaW').get();
  console.log(`Found ${snap.size} reviews.`);
  
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.issueCategory) {
       console.log(`Analyzing review ${doc.id}`);
       try {
           const analysis = await openaiService.analyzeReview({ rating: data.rating, reviewText: data.text });
           await db.collection('reviews').doc(doc.id).update({
             issueCategory: analysis.issueCategory,
             emotion: analysis.emotion
           });
           console.log(`Saved: ${analysis.issueCategory}, ${analysis.emotion}`);
       } catch (err) {
           console.error("Error analyzing review", err.message);
       }
    } else {
       console.log(`Review ${doc.id} already has category ${data.issueCategory}`);
    }
  }
  console.log("Done.");
  process.exit(0);
}

run();

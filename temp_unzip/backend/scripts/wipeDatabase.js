require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDb, admin } = require('../config/firebase');

async function wipe() {
  const db = getDb();
  console.log('Connected to Firebase.');

  const wipeCollection = async (collectionName) => {
    console.log(`Wiping ${collectionName}...`);
    const snap = await db.collection(collectionName).get();
    let count = 0;
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
  await wipeCollection('users'); // if exists

  console.log('Wiping Auth users...');
  let pageToken;
  let authUsersCount = 0;
  do {
    const listUsersResult = await admin.auth().listUsers(1000, pageToken);
    pageToken = listUsersResult.pageToken;
    const uids = listUsersResult.users.map(u => u.uid);
    if (uids.length > 0) {
      await admin.auth().deleteUsers(uids);
      authUsersCount += uids.length;
    }
  } while (pageToken);
  
  console.log(`Deleted ${authUsersCount} Auth users.`);
  console.log('Database wiped successfully!');
  process.exit(0);
}

wipe().catch(err => {
  console.error(err);
  process.exit(1);
});

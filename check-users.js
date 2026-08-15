import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

try {
  initializeApp({
    credential: applicationDefault(),
    databaseURL: 'https://quanlythuchiapp-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'quanlythuchiapp'
  });
} catch (e) {
  initializeApp({
    databaseURL: 'https://quanlythuchiapp-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'quanlythuchiapp'
  });
}

async function check() {
  try {
    const db = getDatabase();
    const snapshot = await db.ref('/').once('value');
    console.log('=== REALTIME DATABASE STRUCTURE ===');
    const data = snapshot.val();
    if (!data) {
      console.log('Database is empty or null.');
    } else {
      console.log('Root nodes:', Object.keys(data));
      for (const nodeKey of Object.keys(data)) {
        console.log(`\nNode [${nodeKey}]:`);
        const nodeData = data[nodeKey];
        if (typeof nodeData === 'object' && nodeData !== null) {
          for (const uid of Object.keys(nodeData)) {
            const count = typeof nodeData[uid] === 'object' && nodeData[uid] !== null ? Object.keys(nodeData[uid]).length : 0;
            console.log(`  - UID: ${uid} -> ${count} items`);
            
            // If it's transactions, print details
            if (nodeKey === 'transactions') {
              const txs = nodeData[uid];
              if (txs) {
                Object.entries(txs).forEach(([txId, tx]) => {
                  console.log(`      * Tx ${txId}: date=${tx.date} | type=${tx.type} | amount=${tx.amount} | note=${tx.note}`);
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error during DB check:', err);
  }
  process.exit(0);
}

check();

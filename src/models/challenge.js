const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for challenges, using userId as doc id.
// TTL/expiry must be enforced via app logic or Firestore TTL policies.
const Challenge = FirestoreModel('challenges', { idField: 'userId' });

module.exports = Challenge;

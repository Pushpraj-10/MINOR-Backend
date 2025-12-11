const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for used tokens. TTL must be implemented via
// application logic or Firestore TTL policies (if enabled in your project).
const UsedToken = FirestoreModel('usedTokens', { idField: 'tokenHash' });

module.exports = UsedToken;

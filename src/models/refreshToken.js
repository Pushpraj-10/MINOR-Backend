const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for refresh tokens; use tokenId as document id.
const RefreshToken = FirestoreModel('refreshTokens', { idField: 'tokenId' });

module.exports = RefreshToken;



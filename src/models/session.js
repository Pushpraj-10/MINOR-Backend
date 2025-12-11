const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for sessions. We use `sessionId` as logical identifier,
// but Firestore doc id will be auto unless explicitly set during create.
const Session = FirestoreModel('sessions', { idField: 'sessionId' });

module.exports = Session;



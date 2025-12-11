const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for leave requests. Use auto id; filter by userId.
const Leave = FirestoreModel('leaves', { idField: 'id' });

module.exports = Leave;
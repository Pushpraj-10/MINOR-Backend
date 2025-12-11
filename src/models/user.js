const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for users, using `uid` as document id when provided
const User = FirestoreModel('users', { idField: 'uid' });

module.exports = User;
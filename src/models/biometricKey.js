const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for biometric keys, using userId as doc id
const BiometricKey = FirestoreModel('biometricKeys', { idField: 'userId' });

module.exports = BiometricKey;
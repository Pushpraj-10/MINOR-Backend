const { FirestoreModel } = require('./_firestoreModel');

// Firestore collection for attendance records
// Fields mirror the original schema for smoother migration.
// Note: Firestore does not enforce indexes here; configure indexes in console if needed.
const Attendance = FirestoreModel('attendance', { idField: 'id' });

module.exports = Attendance;



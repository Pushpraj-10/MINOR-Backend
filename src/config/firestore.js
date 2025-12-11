const admin = require('firebase-admin');

/**
 * Initialize and return a Firestore instance.
 * Expects one of the following environment setups:
 * - GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON, and either
 *   FIRESTORE_URI like "projects/<projectId>/databases/(default)" or FIRESTORE_PROJECT_ID.
 * - Or use default application credentials (e.g., on GCP) with FIRESTORE_PROJECT_ID.
 */
function connectToFirestore() {
  const uri = process.env.FIRESTORE_URI;
  const explicitProjectId = process.env.FIRESTORE_PROJECT_ID;
  const projectId = explicitProjectId || extractProjectIdFromUri(uri);

  if (!projectId) {
    throw new Error(
      'Missing Firestore project id. Set FIRESTORE_PROJECT_ID or provide FIRESTORE_URI like "projects/<projectId>/databases/(default)".'
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
      // credential: application default or service account via GOOGLE_APPLICATION_CREDENTIALS
      credential: admin.credential.applicationDefault(),
    });
  }

  const db = admin.firestore();
  // Optional: set settings here (timestampsInSnapshots is default true now)
  console.log(`Firestore initialized for project: ${projectId}`);
  return db;
}

function extractProjectIdFromUri(uri) {
  if (!uri) return null;
  // Expected format: projects/<projectId>/databases/(default)
  const m = /projects\/(.*?)\/databases\//.exec(uri);
  return m && m[1] ? m[1] : null;
}

module.exports = { connectToFirestore };

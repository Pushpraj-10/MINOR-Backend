const { connectToFirestore } = require('../config/firestore');

function FirestoreModel(collectionName, { idField = 'id' } = {}) {
  const db = connectToFirestore();
  const col = db.collection(collectionName);

  async function create(doc) {
    const data = { ...doc };
    if (data[idField]) {
      const ref = col.doc(String(data[idField]));
      await ref.set(data, { merge: true });
      const snap = await ref.get();
      return { id: ref.id, ...snap.data() };
    } else {
      const ref = await col.add(data);
      const snap = await ref.get();
      return { id: ref.id, ...snap.data() };
    }
  }

  async function findOne(where = {}) {
    const q = buildQuery(col, where).limit(1);
    const snap = await q.get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async function find(where = {}, options = {}) {
    let q = buildQuery(col, where);
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function updateOne(where, update) {
    const doc = await findOne(where);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    const ref = col.doc(String(doc[idField] || doc.id));
    await ref.set(update.$set ? update.$set : update, { merge: true });
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async function deleteOne(where) {
    const doc = await findOne(where);
    if (!doc) return { deletedCount: 0 };
    const ref = col.doc(String(doc[idField] || doc.id));
    await ref.delete();
    return { deletedCount: 1 };
  }

  return { create, findOne, find, updateOne, deleteOne, collection: col };
}

function buildQuery(col, where) {
  let q = col;
  for (const [key, val] of Object.entries(where)) {
    if (val && typeof val === 'object' && ('$gte' in val || '$lte' in val)) {
      if ('$gte' in val) q = q.where(key, '>=', val.$gte);
      if ('$lte' in val) q = q.where(key, '<=', val.$lte);
    } else if (val && typeof val === 'object' && ('$in' in val)) {
      // Firestore doesn't support 'in' with large arrays; keep small
      q = q.where(key, 'in', val.$in);
    } else {
      q = q.where(key, '==', val);
    }
  }
  return q;
}

module.exports = { FirestoreModel };

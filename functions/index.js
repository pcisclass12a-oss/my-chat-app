const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const doc = await admin.firestore().collection("admins").doc(uid).get();

  if (!doc.exists) throw new functions.https.HttpsError("permission-denied");

  const user = await admin.auth().createUser({
    email: data.email,
    password: data.password
  });

  return { uid: user.uid };
});

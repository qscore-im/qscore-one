/**
 * firebase-config.js
 *
 * Only used when deployed to Firebase Hosting (ignored during local Socket.io dev).
 * Replace the placeholder values below with your project credentials from:
 *   Firebase Console → Project Settings → Your apps → Web app → SDK setup
 *
 * DO NOT commit real credentials to a public repository.
 */

(window as any).FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

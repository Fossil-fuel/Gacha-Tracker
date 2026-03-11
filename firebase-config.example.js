/**
 * Firebase configuration for cloud sync.
 * Copy this file to firebase-config.js and replace with your Firebase project credentials.
 *
 * Setup:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a project (or use existing)
 * 3. Add a Web app, copy the config below
 * 4. Enable Authentication: Sign-in method → Google, Facebook, Twitter
 * 5. Create Firestore database (start in test mode for dev, then add rules)
 * 6. Add authorized domains (e.g. your GitHub Pages URL, localhost)
 */
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

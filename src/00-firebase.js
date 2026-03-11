/**
 * Firebase Auth + Firestore for cloud sync.
 * Requires: Firebase SDK scripts + firebase-config.js loaded before app.js.
 * When FIREBASE_CONFIG is not set or placeholder, cloud features are disabled.
 */
(function () {
  "use strict";

  const USERS_COLLECTION = "users";
  const DATA_FIELD = "data";

  function isFirebaseConfigured() {
    const cfg = typeof window !== "undefined" && window.FIREBASE_CONFIG;
    return cfg && cfg.apiKey && cfg.apiKey !== "YOUR_API_KEY" && cfg.projectId && cfg.projectId !== "YOUR_PROJECT_ID";
  }

  window.isFirebaseConfigured = isFirebaseConfigured;

  function noop() {}

  window.initFirebaseAuth = noop;
  window.__cloudSave = noop;
  window.__firebaseAuthReady = noop;
  window.getFirebaseUser = function () { return null; };
  window.signInWithGoogle = noop;
  window.signInWithFacebook = noop;
  window.signInWithTwitter = noop;
  window.signOutCloud = noop;
  window.updateAccountUI = noop;

  if (!isFirebaseConfigured()) return;

  if (typeof firebase === "undefined") return;

  try {
    const app = firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let currentUser = null;

    window.getFirebaseUser = function () {
      return currentUser;
    };

    window.__cloudSave = function (jsonStr) {
      if (!currentUser) return Promise.resolve();
      return db.collection(USERS_COLLECTION).doc(currentUser.uid).set({ [DATA_FIELD]: jsonStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
    };

    function fetchCloudData() {
      if (!currentUser) return Promise.resolve(null);
      return db.collection(USERS_COLLECTION).doc(currentUser.uid).get().then(function (doc) {
        return doc.exists && doc.data() && doc.data()[DATA_FIELD] ? doc.data()[DATA_FIELD] : null;
      }).catch(function () { return null; });
    }

    function onAuthStateChanged(user) {
      currentUser = user;
      if (typeof window.updateAccountUI === "function") window.updateAccountUI(user);

      if (!user) {
        window.__firebaseAuthReady();
        return;
      }

      fetchCloudData().then(function (cloudData) {
        if (cloudData && typeof window.__applyCloudData === "function") {
          window.__applyCloudData(cloudData);
        } else if (typeof window.__uploadLocalToCloud === "function") {
          window.__uploadLocalToCloud();
        }
        window.__firebaseAuthReady();
      }).catch(function () {
        window.__firebaseAuthReady();
      });
    }

    auth.onAuthStateChanged(onAuthStateChanged);

    auth.getRedirectResult().catch(function () {});

    window.initFirebaseAuth = function () {
      currentUser = auth.currentUser;
      if (currentUser && typeof window.updateAccountUI === "function") window.updateAccountUI(currentUser);
    };

    function signInWithProvider(provider) {
      auth.signInWithPopup(provider).catch(function (err) {
        if (err.code === "auth/popup-blocked") {
          auth.signInWithRedirect(provider);
        } else {
          alert("Sign-in failed: " + (err.message || err.code));
        }
      });
    }

    window.signInWithGoogle = function () {
      signInWithProvider(new firebase.auth.GoogleAuthProvider());
    };

    window.signInWithFacebook = function () {
      signInWithProvider(new firebase.auth.FacebookAuthProvider());
    };

    window.signInWithTwitter = function () {
      signInWithProvider(new firebase.auth.TwitterAuthProvider());
    };

    window.signOutCloud = function () {
      auth.signOut();
    };
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
})();

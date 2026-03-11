# Firebase Cloud Sync Setup

To enable Google/Facebook/Twitter login and cloud data storage:

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Add a **Web app** and copy the config object

## 2. Configure the app

1. Copy `firebase-config.example.js` to `firebase-config.js` (or edit the existing one)
2. Replace the placeholder values with your Firebase config:

```js
window.FIREBASE_CONFIG = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id",
};
```

## 3. Enable Authentication

1. In Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Google**, **Facebook**, and **Twitter**
3. For Facebook: add your App ID and App Secret from [Facebook Developers](https://developers.facebook.com/)
4. For Twitter: add API Key and Secret from [Twitter Developer Portal](https://developer.twitter.com/)

## 4. Create Firestore database

1. In Firebase Console → **Firestore Database** → **Create database**
2. Start in **test mode** for development (or production with rules)
3. Deploy the security rules from `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

Or copy the rules from `firestore.rules` into the Firebase Console → Firestore → Rules.

## 5. Add authorized domains

1. In Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Add your deployment URL (e.g. `yourusername.github.io`)
3. `localhost` is usually included by default for local testing

## 6. Rebuild and deploy

```bash
node build.js
```

Then deploy as usual. The Account section will appear in Settings when Firebase is configured.

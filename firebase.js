// ===========================================
// RelayDesk V5
// firebase.js
// Firebase Initialization
// ===========================================

// Firebase Configuration
const firebaseConfig = {

    apiKey: "AIzaSyAl3v1U_BZljuU8f1ui3y4X4ah1V8ss_dc",

    authDomain: "relaydesk-sts.firebaseapp.com",

    projectId: "relaydesk-sts",

    storageBucket: "relaydesk-sts.firebasestorage.app",

    messagingSenderId: "165832724899",

    appId: "1:165832724899:web:0d8e7014c25a49a70a0a16",

    measurementId: "G-Z38WKYX0KP"

};


// ===========================================
// Initialize Firebase
// ===========================================

function initFirebase() {

    if (!firebase.apps.length) {

        firebase.initializeApp(firebaseConfig);

        console.log("✅ Firebase Initialized");

    } else {

        console.log("ℹ️ Firebase Already Initialized");

    }

    // Firestore
    window.db = firebase.firestore();

    // Storage (chat image attachments — Firestore only ever stores the
    // resulting download URL, never the image bytes themselves)
    window.storage = firebase.storage();

    lastChange: Date.now()

}
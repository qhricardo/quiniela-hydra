// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA48HXFNhkFVWmcOnJZHb6cZp2X_QE-pYk",
  authDomain: "quieniela360.firebaseapp.com",
  databaseURL: "https://quieniela360-default-rtdb.firebaseio.com",
  projectId: "quieniela360",
  storageBucket: "quieniela360.firebasestorage.app",
  messagingSenderId: "405592293769",
  appId: "1:405592293769:web:d0c4026fd31875d09ba158",
  measurementId: "G-53BKRGYYGV"
};

// Inicialización segura
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Exporta el módulo de autenticación
const auth = firebase.auth();

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC8itN53SkagtwJPqw6XSllsUP8w7-o7d8",
  authDomain: "quiniela-hydra.firebaseapp.com",
  projectId: "quiniela-hydra",
  storageBucket: "quiniela-hydra.appspot.com", // 🔹 corregido
  messagingSenderId: "329849216739",
  appId: "1:329849216739:web:83d23ff1424eb167172fd6",
  measurementId: "G-FWDDQ5HQYV"
};

// Inicialización segura
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Exporta el módulo de autenticación
const auth = firebase.auth();



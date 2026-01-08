// config.js
// Tämä tiedosto sisältää vain Firebase-yhteyden asetukset.
// Sovelluksen logiikka ja perheenjäsenet haetaan tietokannasta.

export const firebaseConfig = {
  apiKey: "AIzaSyBYqAhcMBFeuN6lcXnV9ydP3ltG3zpbFc4",
  authDomain: "kalenteri-pasi.firebaseapp.com",
  projectId: "kalenteri-pasi",
  storageBucket: "kalenteri-pasi.firebasestorage.app",
  messagingSenderId: "1054742450874",
  appId: "1:1054742450874:web:67fd5799bb21fc28862883"
};

// Oletusasetukset, jos tietokanta on tyhjä
export const DEFAULT_CONFIG = {
  appName: "Perhekalenteri",
  defaultColor: "#f08080"
};

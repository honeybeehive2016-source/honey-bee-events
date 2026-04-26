// ============================================================
// Firebase 設定
// ↓ ここに firebaseConfig をコピー＆ペーストしてください
// ============================================================
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKob1BNd2bdbY3q7AxSLQbktiTJBBPWq4",
  authDomain: "honey-bee-events.firebaseapp.com",
  projectId: "honey-bee-events",
  storageBucket: "honey-bee-events.firebasestorage.app",
  messagingSenderId: "190456839466",
  appId: "1:190456839466:web:46971ce244eefc2329b253",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAmqfSvLZOQQhHk6JNJfOhcX_Q6YdmsXbQ",
  authDomain: "chat-me-123.firebaseapp.com",
  projectId: "chat-me-123",
  storageBucket: "chat-me-123.firebasestorage.app",
  messagingSenderId: "308043881639",
  appId: "1:308043881639:web:8c26554d9adf77ca30cf82",
  measurementId: "G-60DWHRHMP2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

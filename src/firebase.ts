import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCHIZ-MevDrD0ssznHdwCPGyddP0lH8w0A",
  authDomain: "quanlythuchiapp.firebaseapp.com",
  databaseURL: "https://quanlythuchiapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quanlythuchiapp",
  storageBucket: "quanlythuchiapp.firebasestorage.app",
  messagingSenderId: "765950330114",
  appId: "1:765950330114:web:c4e05b3ad4bd01c273ae1b",
  measurementId: "G-J2R54PSXJ9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCHIZ-MevDrD0ssznHdwCPGyddP0lH8w0A",
  authDomain: "quanlythuchiapp.firebaseapp.com",
  databaseURL: "https://quanlythuchiapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quanlythuchiapp",
  storageBucket: "quanlythuchiapp.firebasestorage.app",
  messagingSenderId: "765950330114",
  appId: "1:765950330114:web:c4e05b3ad4bd01c273ae1b",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const dbRef = ref(db);
get(child(dbRef, `/`)).then((snapshot) => {
  if (snapshot.exists()) {
    console.log("Entire database:", JSON.stringify(snapshot.val(), null, 2));
  } else {
    console.log("No data available");
  }
  process.exit(0);
}).catch((error) => {
  console.error("Error fetching data:", error);
  process.exit(1);
});

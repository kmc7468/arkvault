import { BASE_URL } from "./app.ts";

// Waits until the app is ready (e.g. migrations are done)
export default async function globalSetup() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The app didn't start");
}

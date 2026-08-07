import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Basic validation to fail fast on initialization
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `[FirebaseConfig] Missing required environment variables: ` +
      `FIREBASE_PROJECT_ID=${projectId ? 'OK' : 'MISSING'}, ` +
      `FIREBASE_CLIENT_EMAIL=${clientEmail ? 'OK' : 'MISSING'}, ` +
      `FIREBASE_PRIVATE_KEY=${privateKey ? 'OK' : 'MISSING'}`
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
});

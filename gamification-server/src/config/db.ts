import mongoose from 'mongoose';

let connecting: Promise<typeof mongoose> | null = null;

/**
 * Single shared connection for the gamification service process.
 */
export async function connectDatabase(uri: string, dbName?: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  if (connecting) {
    return connecting;
  }
  connecting = mongoose.connect(uri, {
    autoIndex: true,
    dbName: dbName || undefined,
  });
  try {
    await connecting;
    return mongoose;
  } finally {
    connecting = null;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

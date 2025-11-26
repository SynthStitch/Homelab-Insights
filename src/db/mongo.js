import mongoose from "mongoose";
import { config } from "../config.js";

let connectionPromise = null;

function buildConnectionUri() {
  if (!config.mongo.uri) {
    throw new Error("MongoDB connection URI is not configured (set MONGODB_URI).");
  }
  return config.mongo.uri;
}

export function connectMongo() {
  if (connectionPromise) return connectionPromise;

  const uri = buildConnectionUri();
  const options = {
    dbName: config.mongo.dbName || undefined,
    serverSelectionTimeoutMS: 5000,
  };

  connectionPromise = mongoose
    .connect(uri, options)
    .then((conn) => {
      console.log("MongoDB connected");
      return conn;
    })
    .catch((err) => {
      connectionPromise = null;
      console.error("MongoDB connection failed", err);
      throw err;
    });

  return connectionPromise;
}

export function getConnection() {
  if (!mongoose.connection?.readyState) {
    throw new Error("MongoDB is not connected.");
  }
  return mongoose.connection;
}

export async function disconnectMongo() {
  if (mongoose.connection?.readyState) {
    await mongoose.disconnect();
    connectionPromise = null;
  }
}

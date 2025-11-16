import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import websiteRoute from "./routes/websiteRoute";

const app = express();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/openseo";
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/website", websiteRoute);

const startServer = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not defined.");
    }

    mongoose
      .connect(MONGODB_URI)
      .then(() => console.log())
      .catch((err) => {
        console.error("MongoDB connection error: ", err);
        process.exit(1);
      });
    console.log("MongoDB connected successfully.");

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection error: ", error);
    process.exit(1);
  }
};

startServer();

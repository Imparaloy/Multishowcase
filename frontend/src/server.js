import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import cookieParser from "cookie-parser";

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { fromEnv } from '@aws-sdk/credential-providers';

(async () => {
  try {
    const creds = await fromEnv()(); // 👈 เรียก provider แล้ว await
    console.log('Loaded creds:', {
      accessKeyId: creds.accessKeyId,
      hasSessionToken: !!creds.sessionToken,
    });
  } catch (err) {
    console.error('Load creds failed:', err);
  }
})();

// ✅ สร้าง __filename และ __dirname ด้วยตัวเอง
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
// Serve static files from root /public
app.use(express.static(join(__dirname, "..", "public")));

import fileUpload from 'express-fileupload';
import authRoutes from "./routes/auth.routes.js";
import groupsRoutes from "./routes/groups.routes.js";
import homeRoutes from "./routes/home.routes.js";
import exploreRoutes from "./routes/explore.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import postsRoutes from "./routes/posts.routes.js";

// Configure express-fileupload
app.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
}));

// Create uploads directory if it doesn't exist
import fs from 'fs';
const uploadsDir = join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use("/", authRoutes);
app.use("/", groupsRoutes);
app.use("/", homeRoutes);
app.use("/", exploreRoutes);
app.use("/", commentRoutes);
app.use("/", profileRoutes);
app.use("/", postsRoutes);

// 404
app.use((req, res) => res.status(404).send("Not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

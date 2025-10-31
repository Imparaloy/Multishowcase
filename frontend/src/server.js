import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import cookieParser from "cookie-parser";

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';


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
// Serve static files from uploads directory
app.use("/uploads", express.static(join(__dirname, "..", "uploads")));

import initializeDatabase from './config/init-db.js';
import fileUpload from 'express-fileupload';
import authRoutes from "./routes/auth.routes.js";
import groupsRoutes from "./routes/groups.routes.js";
import homeRoutes from "./routes/home.routes.js";
import exploreRoutes from "./routes/explore.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import postsRoutes from "./routes/posts.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import sseRoutes from "./routes/sse.routes.js";
import renderRoutes from "./routes/render.routes.js";

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
app.use("/api", reportsRoutes);
app.use("/api", sseRoutes);
app.use("/api", renderRoutes);

// 404
app.use((req, res) => res.status(404).send("Not found"));

// Initialize database on startup
initializeDatabase().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

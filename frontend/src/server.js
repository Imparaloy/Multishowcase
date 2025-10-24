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

import authRoutes from "./routes/auth.routes.js";
import groupsRoutes from "./routes/groups.routes.js";
import homeRoutes from "./routes/home.routes.js";
import exploreRoutes from "./routes/explore.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import profileRoutes from "./routes/profile.routes.js";

app.use("/", authRoutes);
app.use("/", groupsRoutes);
app.use("/", homeRoutes);
app.use("/", exploreRoutes);
app.use("/", commentRoutes);
app.use("/", profileRoutes);

// 404
app.use((req, res) => res.status(404).send("Not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

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
app.use(express.static(join(__dirname, "public")));

import viewRoutes from "./routes/index.routes.js";
import authRoutes from "./routes/auth.routes.js";

app.use("/", viewRoutes);
app.use("/", authRoutes);

import postRoutes from "./routes/post.routes.js";
app.use("/upload", postRoutes);
// 404
app.use((req, res) => res.status(404).send("Not found"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}/`));

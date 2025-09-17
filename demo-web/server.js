import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ตั้งค่า EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// เสิร์ฟไฟล์ static (เช่น /js/signup.js)
app.use(express.static(path.join(__dirname, "public")));

// route สมัครสมาชิก
app.get("/signup", (req, res) => {
  res.render("signup")});


// หน้า login 
app.get("/login", (req, res) => {
  res.render("login")});

app.get("/welcome_page", (req, res) => {
  res.render("welcome_page")});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

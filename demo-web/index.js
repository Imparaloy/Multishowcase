const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// ตั้งค่า view engine เป็น EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Sample data
const posts = [
  {
    name: "Sirikul",
    username: "sirikul_ux",
    content: "กำลังลองทำ element post ใน EJS + Tailwind 🎉",
    comments: "120",
    likes: "3.5k",
    reactions: "5.2k",
    views: "8.1k",
  },
  {
    name: "Kanathip",
    username: "wave_dev",
    content: "ระบบ Wave progression เสร็จแล้ว ✔️",
    comments: "80",
    likes: "2.1k",
    reactions: "1.5k",
    views: "4.3k",
  },
];

// Route
app.get("/", (req, res) => {
  res.render("./views/home", { posts });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

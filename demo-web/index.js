const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// ตั้งค่า view engine เป็น ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// middleware เสิร์ฟ static file
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, "public")));

// route profile
app.get("/profile", (req, res) => {
  res.render("profile", {
    title: "Profile",
    user: {
      name: "John Doe",
      username: "johnd",
      followers: 120,
      following: 85
    },
    posts: [
      { author: { name: "John Doe", username: "johnd" }, content: "My first post!" },
      { author: { name: "John Doe", username: "johnd" }, content: "Working on my project..." }
    ],
    trends: [
      { title: "# CLOUD COMPUTING", count: "36.7K" },
      { title: "# GAME DESIGN", count: "25.1K" },
      { title: "# HUMAN INTERFACE DESIGN", count: "14.9K" }
    ]
  });
});
// res.render("profile", {
//   title: "Profile",
//   user, posts, trends,
//   errors: [],      // หรือ array ของข้อความ error
//   form: null,      // หรือ object ที่ผู้ใช้เพิ่งกรอก { name, username, bio }
//   openModal: false // หรือ true ถ้าต้องการให้เปิด modal อัตโนมัติ
// });


// เริ่ม server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

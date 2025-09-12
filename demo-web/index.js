const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// --- Sample data ---
const forYouPosts = [
  {
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากนอนหลับสัก 48 ชั่วโมง",
    comments: "120",
    likes: "3.5k",
    reactions: "5.2k",
    views: "8.1k",
  },
  {
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากเล่นเกมไม่อยากทำงานing",
    comments: "80",
    likes: "2.1k",
    reactions: "1.5k",
    views: "4.3k",
  },
];

const followingPosts = [
  {
    name: "Polor",
    username: "Polor_inwza",
    content: "ตามเพื่อนอยู่ 555",
    comments: "12",
    likes: "240",
    reactions: "360",
    views: "1.1k",
  },
];

// --- Routes ---
app.get("/", (req, res) => {
  res.render("home", {
    activeTab: "for-you",
    feed: forYouPosts,
  });
});

app.get("/following", (req, res) => {
  res.render("home", {
    activeTab: "following",
    feed: followingPosts,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// --- Mock data for comment page ---
const commentMock = [
  {
    id: 1,
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากนอนหลับสัก 48 ชั่วโมง",
    comments: "120",
    likes: "3.5k",
    reactions: "5.2k",
    views: "8.1k",
  },
  {
    id: 2,
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากเล่นเกมไม่อยากทำงานing",
    comments: "80",
    likes: "2.1k",
    reactions: "1.5k",
    views: "4.3k",
  },
];

const commentsByPost = {
  1: [
    {
      name: "Name",
      username: "Username",
      content:
        "Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping. Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping.",
      comments: "2.0k",
      likes: "30k",
    },
    {
      name: "Name",
      username: "Username",
      content:
        "Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping. Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping.",
      comments: "2.0k",
      likes: "30k",
    },
  ],
  2: [
    {
      name: "Another",
      username: "AnotherUser",
      content:
        "This is a comment for post 2 only.",
      comments: "1.1k",
      likes: "2k",
    }
  ]
};
// --- Comment page route ---
app.get("/comment", (req, res) => {
  const id = parseInt(req.query.id);
  // รวมโพสต์จากทุกแหล่ง
  const allPosts = [...forYouPosts, ...followingPosts];
  const post = allPosts.find((p) => p.id === id) || allPosts[0];
  const comments = commentsByPost[post.id] || [];
  res.render("comment", {
    post: post,
    comments: comments,
  });
});

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// --- Sample data ---
const forYouPosts = commentMock;

const followingPosts = [
  {
    id: 3,
    name: "Polor",
    username: "Polor_inwza",
    content: "ตามเพื่อนอยู่ 555",
    comments: "12",
    likes: "240",
    reactions: "360",
    views: "1.1k",
  },
];

commentsByPost[3] = [
  {
    name: "Friend",
    username: "frienduser",
    content: "คอมเมนต์สำหรับโพสต์ following เท่านั้น",
    comments: "10",
    likes: "20",
  }
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

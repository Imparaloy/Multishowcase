const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

const currentUser = {
  username: "Polor_inwza",
  displayName: "Polor",
  role: "admin",
};

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
    tags: ["model", "animation-3d"],
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
    tags: ["game-dev", "website"],
  },
  {
    id: 4,
    name: "Tarn",
    username: "tarnux",
    content: "ออกแบบ UI Dashboard ใหม่สำหรับโปรเจกต์ capstone",
    comments: "56",
    likes: "1.1k",
    reactions: "2.4k",
    views: "4.9k",
    tags: ["ux-ui", "website"],
  },
  {
    id: 5,
    name: "Mix",
    username: "mixdev",
    content: "Render โมเดล 3D รถยนต์คันแรกด้วย Blender",
    comments: "24",
    likes: "980",
    reactions: "1.9k",
    views: "3.1k",
    tags: ["animation-3d", "model"],
  },
  {
    id: 6,
    name: "Poom",
    username: "poomcode",
    content: "Prototype เกมแนว roguelike รอบใหม่",
    comments: "18",
    likes: "760",
    reactions: "1.3k",
    views: "2.6k",
    tags: ["game-dev"],
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
    currentUser,
    activePage: null,
  });
});

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files (root /public)
app.use(express.static(path.join(__dirname, "..", "public")));

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
    tags: ["for-you"],
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

const groupsMock = [
  {
    id: 1,
    name: "3D Artists Hub",
    description: "รวมผลงาน 3D, แบ่งปัน workflow และคอมเมนต์ให้กัน",
    owner: "Polor_inwza",
    members: [
      { username: "Polor_inwza", displayName: "Polor", role: "owner" },
      { username: "tarnux", displayName: "Tarn", role: "member" },
      { username: "poomcode", displayName: "Poom", role: "member" },
    ],
    pendingRequests: [
      {
        username: "mixdev",
        displayName: "Mix",
        message: "ขอร่วมแชร์งาน animation 3D ด้วยครับ",
      },
    ],
    invitations: [
      {
        username: "yodmodel",
        displayName: "Yod",
        invitedBy: "Polor",
      },
    ],
    posts: [
      {
        id: 1,
        author: "Polor",
        timestamp: "2 ชม. ที่แล้ว",
        content: "อัปเดต guideline สำหรับ rigging ใหม่ ลองโหลดได้ในไฟล์แนบ",
      },
      {
        id: 2,
        author: "Tarn",
        timestamp: "เมื่อวาน",
        content: "UI mockup สำหรับ dashboard กลุ่มนี้ ใครมีฟีดแบ็กคอมเมนต์ได้เลย",
      },
    ],
  },
  {
    id: 2,
    name: "Game Dev Squad",
    description: "พูดคุยการพัฒนาเกม prototype ใหม่ ๆ",
    owner: "poomcode",
    members: [
      { username: "poomcode", displayName: "Poom", role: "owner" },
      { username: "Polor_inwza", displayName: "Polor", role: "member" },
    ],
    pendingRequests: [],
    invitations: [],
    posts: [],
  },
];

const exploreTags = [
  { slug: "all", label: "For you" },
  { slug: "model", label: "Model" },
  { slug: "animation-3d", label: "Animation 3D" },
  { slug: "game-dev", label: "Game Dev" },
  { slug: "ux-ui", label: "UX/UI design" },
  { slug: "website", label: "Website" },
];

// --- Routes ---
app.get("/", (req, res) => {
  res.render("home", {
    activeTab: "for-you",
    feed: forYouPosts,
    currentUser,
    activePage: "home",
  });
});

app.get("/following", (req, res) => {
  res.render("home", {
    activeTab: "following",
    feed: followingPosts,
    currentUser,
    activePage: "home",
  });
});

// --- Explore page route ---
app.get("/explore", (req, res) => {
  const requestedTag = (req.query.tag || "all").toLowerCase();
  const availableTags = new Set(exploreTags.map((tag) => tag.slug));
  const tag = availableTags.has(requestedTag) ? requestedTag : "all";
  const rawQuery = (req.query.q || "").trim();
  const searchQuery = rawQuery.toLowerCase();

  const feed = commentMock.filter((post) => {
    const matchTag =
      tag === "all" || post.tags?.some((postTag) => postTag.toLowerCase() === tag);

    if (!matchTag) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const searchable = `${post.name} ${post.username} ${post.content} ${
      post.tags?.join(" ") || ""
    }`.toLowerCase();

    return searchable.includes(searchQuery);
  });

  res.render("explore", {
    feed,
    exploreTags,
    activeTag: tag,
    searchQuery: rawQuery,
    searchQueryEncoded: rawQuery ? encodeURIComponent(rawQuery) : "",
    currentUser,
    activePage: "explore",
  });
});

// --- Profile page route ---
app.get("/profile", (req, res) => {
  const me = {
    name: currentUser.displayName,
    username: currentUser.username,
  };

  res.render("profile", {
    me,
    currentUser,
    activePage: "profile",
  });
});

// --- Auth pages ---
app.get('/login', (req, res) => {
  // If user is already logged in, you might redirect to profile or home.
  // Here we simply render the login page. currentUser is not set.
  res.render('login');
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

// --- Logout route ---
app.post('/logout', (req, res) => {
  // If using express-session this will destroy the session.
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy((err) => {
      // ignore error and redirect to home
      return res.redirect('/');
    });
    return;
  }

  // If using Passport.js, call req.logout when available
  if (typeof req.logout === 'function') {
    try {
      req.logout();
    } catch (e) {
    }
  }

  return res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

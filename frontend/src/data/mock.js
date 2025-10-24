// Mock data used by Set B routes
export const currentUser = {
  username: "Polor_inwza",
  displayName: "Polor",
  role: "admin",
};

export const commentMock = [
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

export const followingPosts = [
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

export const forYouPosts = commentMock;

export const commentsByPost = {
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
      content: "This is a comment for post 2 only.",
      comments: "1.1k",
      likes: "2k",
    },
  ],
};

// Add comments for post id 3 used by followingPosts
commentsByPost[3] = [
  {
    name: "Friend",
    username: "frienduser",
    content: "คอมเมนต์สำหรับโพสต์ following เท่านั้น",
    comments: "10",
    likes: "20",
  },
];

export const exploreTags = [
  { slug: "all", label: "For you" },
  { slug: "model", label: "Model" },
  { slug: "animation-3d", label: "Animation 3D" },
  { slug: "game-dev", label: "Game Dev" },
  { slug: "ux-ui", label: "UX/UI design" },
  { slug: "website", label: "Website" },
];

const express = require("express");
const path = require("path");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req,res)=>res.redirect("/profile"));
app.get("/profile", (req,res)=>{
  res.render("profile", {
    title: "Multi showcase",
    me: { name:"Name", username:"Username", following:0, followers:0 },
    trending: [
      { tag:"CLOUD COMPUTING", posts:"36.7K" },
      { tag:"INTRODUCTION TO GAME DESIGN AND DEVELOPMENT", posts:"36.7K" },
      { tag:"HUMAN INTERFACE DESIGN", posts:"36.7K" }
    ],
    posts: [
      { id:1, name:"Name", username:"Username", text:"Most fonts have a particular weight ...", metrics:{comments:"2.0k",reposts:"20k",likes:"30k",views:"1.8k"}, isRepostedByYou:true },
      { id:2, name:"Name", username:"Username", text:"Most fonts have a particular weight ...", metrics:{comments:"2.0k",reposts:"20k",likes:"30k",views:"1.8k"} }
    ]
  });
});
app.get('/bookmarks', (req, res) => {
  res.render('bookmark', {
    title: "Multi showcase",
    me: { name: 'Name', username: 'username' },
    bookmarks: [], // หรือใส่รายการโพสต์เพื่อทดสอบ
    trending: [
      { tag: 'CLOUD COMPUTING', posts: '36.7K' },
      { tag: 'INTRODUCTION TO GAME DESIGN AND DEVELOPMENT', posts: '36.7K' },
      { tag: 'HUMAN INTERFACE DESIGN', posts: '36.7K' }
    ]
  });
});

app.listen(3000, ()=>console.log("http://localhost:3000/profile"));

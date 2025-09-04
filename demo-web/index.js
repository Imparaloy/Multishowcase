const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// ตั้งค่า view engine เป็น EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Router เริ่มต้น
app.get('/', (req, res) => {
  res.render('home', { title: "Multi Showcase" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const PORT = 3000;
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Route ตัวอย่าง
app.get('/', (req, res) => {
  res.send('Hello World! 🚀');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

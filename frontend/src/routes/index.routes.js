// src/routes/index.routes.js
import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.render('layout', { title: 'Home' }); // หรือหน้า landing
});

export default router;

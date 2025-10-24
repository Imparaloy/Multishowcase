import express from 'express';
import { renderGroupsPage, createGroup } from '../controllers/groups.controller.js';
// import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

// แสดงกลุ่มทั้งหมด
router.get('/groups', renderGroupsPage);

// สร้างกลุ่มใหม่ (อนุญาตให้เรียกได้แม้ไม่ล็อกอิน แต่จะไม่มี createdBy)
router.post('/groups', /* authenticateCognitoJWT, */ createGroup);

export default router;

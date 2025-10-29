import express from 'express';
import {
  renderGroupsPage,
  createGroup,
  renderGroupDetailsPage,
  joinGroupHandler,
  leaveGroupHandler,
  deleteGroupHandler,
  createGroupPost
} from '../controllers/groups.controller.js';
// import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

// แสดงกลุ่มทั้งหมด
router.get('/groups', renderGroupsPage);

// แสดงรายละเอียดกลุ่ม
router.get('/groups/:id', renderGroupDetailsPage);

// สร้างกลุ่มใหม่ (อนุญาตให้เรียกได้แม้ไม่ล็อกอิน แต่จะไม่มี createdBy)
router.post('/groups', /* authenticateCognitoJWT, */ createGroup);


// ขอเข้าร่วมกลุ่ม
router.post('/groups/:id/join', /* authenticateCognitoJWT, */ joinGroupHandler);

// ออกจากกลุ่ม
router.post('/groups/:id/leave', /* authenticateCognitoJWT, */ leaveGroupHandler);

// ลบกลุ่ม (เฉพาะเจ้าของ)
router.delete('/groups/:id', /* authenticateCognitoJWT, */ deleteGroupHandler);

// สร้างโพสต์ในกลุ่ม
router.post('/groups/:id/posts', /* authenticateCognitoJWT, */ createGroupPost);

export default router;

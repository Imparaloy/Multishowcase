import express from 'express';
import {
  renderGroupsPage,
  createGroup,
  renderGroupDetailsPage,
  requestJoinGroup,
  leaveGroupHandler,
  deleteGroupHandler,
  approveJoinRequestHandler,
  rejectJoinRequestHandler,
  changeMemberRoleHandler,
  removeMemberHandler,
  createGroupPost,
  deleteGroupPostHandler
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
router.post('/groups/:id/join', /* authenticateCognitoJWT, */ requestJoinGroup);

// ออกจากกลุ่ม
router.post('/groups/:id/leave', /* authenticateCognitoJWT, */ leaveGroupHandler);

// ลบกลุ่ม (เฉพาะเจ้าของ)
router.delete('/groups/:id', /* authenticateCognitoJWT, */ deleteGroupHandler);

// อนุมัติคำขอเข้าร่วม (เฉพาะเจ้าของ)
router.post('/groups/:id/requests/:username/approve', /* authenticateCognitoJWT, */ approveJoinRequestHandler);

// ปฏิเสธคำขอเข้าร่วม (เฉพาะเจ้าของ)
router.post('/groups/:id/requests/:username/reject', /* authenticateCognitoJWT, */ rejectJoinRequestHandler);

// เปลี่ยนบทบาทสมาชิก (เฉพาะเจ้าของ)
router.put('/groups/:id/members/:username/role', /* authenticateCognitoJWT, */ changeMemberRoleHandler);

// ลบสมาชิก (เฉพาะเจ้าของ)
router.delete('/groups/:id/members/:username', /* authenticateCognitoJWT, */ removeMemberHandler);

// สร้างโพสต์ในกลุ่ม
router.post('/groups/:id/posts', /* authenticateCognitoJWT, */ createGroupPost);

// ลบโพสต์ในกลุ่ม
router.delete('/groups/:id/posts/:postId', /* authenticateCognitoJWT, */ deleteGroupPostHandler);

export default router;

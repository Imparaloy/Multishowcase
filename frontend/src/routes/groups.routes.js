import express from 'express';
import {
  renderGroupsPage,
  createGroup,
  renderGroupDetailsPage,
  joinGroupHandler,
  leaveGroupHandler,
  deleteGroupHandler,
  createGroupPost,
  approveJoinRequestHandler,
  rejectJoinRequestHandler,
  changeMemberRoleHandler,
  removeMemberHandler
} from '../controllers/groups.controller.js';
import { authenticateCognitoJWT, requireAuth, attachUserToLocals } from '../middlewares/authenticate.js';

const router = express.Router();

// แสดงกลุ่มทั้งหมด
router.get('/groups', authenticateCognitoJWT, requireAuth, renderGroupsPage);

// แสดงรายละเอียดกลุ่ม
router.get('/groups/:id', attachUserToLocals, renderGroupDetailsPage);

// สร้างกลุ่มใหม่ (อนุญาตให้เรียกได้แม้ไม่ล็อกอิน แต่จะไม่มี createdBy)
router.post('/groups', authenticateCognitoJWT, requireAuth, createGroup);


// ขอเข้าร่วมกลุ่ม
router.post('/groups/:id/join', authenticateCognitoJWT, requireAuth, joinGroupHandler);

// อนุมัติ/ปฏิเสธคำขอเข้าร่วม (เฉพาะเจ้าของ)
router.post('/groups/:id/requests/:requestId/approve', authenticateCognitoJWT, requireAuth, approveJoinRequestHandler);
router.post('/groups/:id/requests/:requestId/reject', authenticateCognitoJWT, requireAuth, rejectJoinRequestHandler);

// ออกจากกลุ่ม
router.post('/groups/:id/leave', authenticateCognitoJWT, requireAuth, leaveGroupHandler);

// ลบกลุ่ม (เฉพาะเจ้าของ)
router.delete('/groups/:id', authenticateCognitoJWT, requireAuth, deleteGroupHandler);

// สร้างโพสต์ในกลุ่ม
router.post('/groups/:id/posts', authenticateCognitoJWT, requireAuth, createGroupPost);

// เปลี่ยนบทบาทสมาชิก (เฉพาะเจ้าของ)
router.put('/groups/:id/members/:username/role', authenticateCognitoJWT, requireAuth, changeMemberRoleHandler);

// ลบสมาชิกออกจากกลุ่ม (เฉพาะเจ้าของ)
router.delete('/groups/:id/members/:username', authenticateCognitoJWT, requireAuth, removeMemberHandler);

export default router;

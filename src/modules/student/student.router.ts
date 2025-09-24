import { Router } from "express";
import {
  createRegistration,
  updateRegistration,
  deleteRegistration,
  markAttendance,
} from "./student.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

router.post("/registration", authenticateToken, createRegistration);
router.put("/registration/:id", authenticateToken, updateRegistration);
router.delete("/registration/:id", authenticateToken, deleteRegistration);
router.post("/attendance/mark", authenticateToken, markAttendance);

export default router;
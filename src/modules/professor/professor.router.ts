import { Router } from "express";
import {
  createProfessorAssignment,
  updateProfessorAssignment,
  deleteProfessorAssignment,
  generateSessionQR,
} from "./professor.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

router.post("/professor-assignment", authenticateToken, createProfessorAssignment);
router.put("/professor-assignment/:id", authenticateToken, updateProfessorAssignment);
router.delete("/professor-assignment/:id", authenticateToken, deleteProfessorAssignment);
router.post("/generateQR", authenticateToken, generateSessionQR);

export default router;

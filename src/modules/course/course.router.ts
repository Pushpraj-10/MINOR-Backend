import { Router } from "express";
import { createCourse, updateCourse, deleteCourse } from "./course.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

// ========== Create COURSE ==========
router.post("/course", authenticateToken, createCourse);

// ========== UPDATE COURSE ==========
router.patch("/course/:code", authenticateToken, updateCourse);

// ========== DELETE COURSE ==========
router.delete("/course/:code", authenticateToken, deleteCourse);

export default router;
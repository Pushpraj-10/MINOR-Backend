import { Router } from "express";
import { createCourseOffering, updateCourseOffering, deleteCourseOffering } from "./courseOffer.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

// ========== CREATE ==========
router.post("/courseOffering", authenticateToken, createCourseOffering);

// ========== UPDATE ==========
router.patch("/courseOffering/:code", authenticateToken, updateCourseOffering);

// ========== DELETE ==========
router.delete("/courseOffering/:code", authenticateToken, deleteCourseOffering);

export default router;
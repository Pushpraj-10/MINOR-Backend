import { Router } from "express";
import { createSession, updateSession, deleteSession } from "./sessions.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

// ========== Create COURSE ==========
router.post("/session", authenticateToken, createSession);

// ========== UPDATE COURSE ==========
router.patch("/session/:code", authenticateToken, updateSession);

// ========== DELETE COURSE ==========
router.delete("/session/:code", authenticateToken, deleteSession);

export default router;
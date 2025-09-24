import { Router } from "express";
import { createBatch, updateBatch, deleteBatch } from "./batch.controller";
import { authenticateToken } from "../auth/auth.middleware";

const router = Router();

// ========== Create COURSE ==========
router.post("/batch", authenticateToken, createBatch);

// ========== UPDATE COURSE ==========
router.patch("/batch/:code", authenticateToken, updateBatch);

// ========== DELETE COURSE ==========
router.delete("/batch/:code", authenticateToken, deleteBatch);

export default router;
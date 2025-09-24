import { Router } from 'express';
import authRoutes from './modules/auth/auth.router';
import courseRoutes from "./modules/course/course.router"
import batchRoutes from "./modules/batch/batch.router"
import courseOfferingRoutes from "./modules/courseOffering/courseOffer.router"
import professorRoutes from "./modules/professor/professor.router"
import sessionRoutes from "./modules/sessions/sessions.router"
import studentRoutes from "./modules/student/student.router"

const router = Router();

// ========= AUTHENTICATION =========
router.use('/auth', authRoutes);

// ========= COURSE =========
router.use('/course', courseRoutes);

// ========= BATCH =========
router.use('/batchapi', batchRoutes);

// ========= COURSE OFFERING =========
router.use('/courseOfferApi', courseOfferingRoutes);

// ========= PROFESSOR =========
router.use('/professorapi', professorRoutes);

// ========= STUDENTS =========
router.use('/studentapi', studentRoutes);

// ========= SESSION =========
router.use('/sessionapi', sessionRoutes);

export default router;

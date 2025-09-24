import { Router } from "express";
import { registerStudent, login, registerProfessor } from "./auth.controller";

const router = Router();

router.post("/register/student", registerStudent);
router.post("/register/professor", registerProfessor);
router.post("/login", login);

export default router;

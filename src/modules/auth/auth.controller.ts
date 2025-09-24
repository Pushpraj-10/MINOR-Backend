import { Request, Response } from "express";
import { studentRegisterSchema, loginSchema, professorRegisterSchema } from "./auth.validation";
import { AuthService } from "./auth.service";

export async function registerStudent(req: Request, res: Response) {
  const parsed = studentRegisterSchema.parse(req.body);
  const student = await AuthService.registerStudent(parsed);
  res.status(201).json(student);
}

export async function registerProfessor(req: Request, res: Response) {
  const parsed = professorRegisterSchema.parse(req.body);
  const professor = await AuthService.registerProfessor(parsed);
  res.status(201).json(professor);
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.parse(req.body);
  const tokens = await AuthService.login(parsed);
  res.json(tokens);
}

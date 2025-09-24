import { z } from "zod";

export const studentRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  branch: z.string().optional()
});

export const professorRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export type StudentRegisterSchema = z.infer<typeof studentRegisterSchema>;
export type ProfessorRegisterSchema = z.infer<typeof professorRegisterSchema>;
export type LoginSchema = z.infer<typeof loginSchema>;
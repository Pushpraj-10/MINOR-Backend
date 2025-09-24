import { z } from "zod";

export const CreateCourse = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  description: z.string().optional(),
  credits: z.number().int().min(0).default(0)
});

export const UpdateCourse = z.object({
  code: z.string().min(2).optional(),
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  credits: z.number().int().min(0).optional()
});

export const DeleteCourse = z.object({
  code: z.string().min(2)
});

export type CourseCreationSchema = z.infer<typeof CreateCourse>;
export type CourseUpdationSchema = z.infer<typeof UpdateCourse>;
export type CourseDeletionSchema = z.infer<typeof DeleteCourse>;
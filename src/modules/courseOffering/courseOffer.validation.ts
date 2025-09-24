import { z } from "zod";

// ========== CREATE COURSE OFFERING ==========
export const CreateCourseOffering = z.object({
  courseId: z.string().uuid(),
  batchId: z.string().uuid(),
  semester: z.string(),
});

// ========== UPDATE COURSE OFFERING ==========
export const UpdateCourseOffering = z.object({
  id: z.string().uuid(), // required to identify which offering to update
  courseId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  semester: z.string().optional(),
});

// ========== DELETE COURSE OFFERING ==========
export const DeleteCourseOffering = z.object({
  id: z.string().uuid(),
});

// ========== TYPES ==========
export type CourseOfferingCreationSchema = z.infer<typeof CreateCourseOffering>;
export type CourseOfferingUpdationSchema = z.infer<typeof UpdateCourseOffering>;
export type CourseOfferingDeletionSchema = z.infer<typeof DeleteCourseOffering>;

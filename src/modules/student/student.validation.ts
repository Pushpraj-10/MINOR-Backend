import { z } from "zod";

// ========== CREATE REGISTRATION ==========
export const CreateStudentCourseRegistration = z.object({
  studentId: z.string().uuid(),
  offeringId: z.string().uuid(),
});

// ========== UPDATE REGISTRATION ==========
export const UpdateStudentCourseRegistration = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  offeringId: z.string().uuid().optional(),
});

// ========== DELETE REGISTRATION ==========
export const DeleteStudentCourseRegistration = z.object({
  id: z.string().uuid(),
});

// ========== ATTENDANCE ==========
export const markAttendanceSchema = z.object({
  token: z.string().min(10, "Invalid token"),
});

// ========== Types ==========
export type StudentCourseRegistrationCreationSchema = z.infer<typeof CreateStudentCourseRegistration>;
export type StudentCourseRegistrationUpdationSchema = z.infer<typeof UpdateStudentCourseRegistration>;
export type StudentCourseRegistrationDeletionSchema = z.infer<typeof DeleteStudentCourseRegistration>;
export type MarkingAttendanceSchema = z.infer<typeof markAttendanceSchema>;
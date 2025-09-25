import { z } from "zod";

// ====== CREATE PROFESSOR ASSIGNMENT ======
export const CreateProfessorAssignment = z.object({
  professorId: z.string().uuid(),
  offeringId: z.string().uuid(),
});

// ====== UPDATE PROFESSOR ASSIGNMENT ======
export const UpdateProfessorAssignment = z.object({
  id: z.string().uuid(), // primary key for update
  professorId: z.string().uuid().optional(),
  offeringId: z.string().uuid().optional(),
});

// ====== DELETE PROFESSOR ASSIGNMENT ======
export const DeleteProfessorAssignment = z.object({
  id: z.string().uuid(), // primary key for deletion
});

// ====== GENERATE SESSION QR-TOKEN ======
export const GenerateSessionQR = z.object({
  sessionId: z.string().uuid(), // must be a valid session
  validFrom: z.string().datetime().optional(), // default now if not provided
  validUntil: z.string().datetime().optional(), // optional expiry
  maxUses: z.number().int().min(0).default(0) // 0 = unlimited
});

// ====== GET PROFESSOR COURSE OFFERINGS ======
export const GetProfessorCourseOfferings = z.object({
  professorId: z.string().uuid(),
});


// ====== Types ======
export type ProfessorAssignmentCreationSchema = z.infer<typeof CreateProfessorAssignment>;
export type ProfessorAssignmentUpdationSchema = z.infer<typeof UpdateProfessorAssignment>;
export type ProfessorAssignmentDeletionSchema = z.infer<typeof DeleteProfessorAssignment>;
export type GenerateSessionQRSchema = z.infer<typeof GenerateSessionQR>;
export type GetProfessorCourseOfferingsSchema = z.infer<typeof GetProfessorCourseOfferings>;
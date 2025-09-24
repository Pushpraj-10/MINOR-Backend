import { z } from "zod";

// ========== CREATE ==========
export const sessionCreationSchema = z.object({
  offeringId: z.string().uuid(),             // required
  professorId: z.string().uuid(),            // required
  sessionDate: z.string().datetime(),        // ISO date string
  topic: z.string().optional(),              // optional
});

// ========== UPDATE ==========
export const sessionUpdationSchema = z.object({
  id: z.string().uuid(),                     // which session to update
  offeringId: z.string().uuid().optional(),
  professorId: z.string().uuid().optional(),
  sessionDate: z.string().datetime().optional(),
  topic: z.string().optional(),
});

// ========== DELETE ==========
export const sessionDeletionSchema = z.object({
  id: z.string().uuid(),                     // delete by session ID
});

// ========== TYPES ==========
export type SessionCreation = z.infer<typeof sessionCreationSchema>;
export type SessionUpdation = z.infer<typeof sessionUpdationSchema>;
export type SessionDeletion = z.infer<typeof sessionDeletionSchema>;
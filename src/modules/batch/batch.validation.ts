import { z } from "zod";

// ========== CREATE ==========
export const CreateBatch = z.object({
  name: z.string().min(2),
  year: z.number().int().min(1900).max(2100), // adjust range as needed
  branch: z.string().min(2),
});

// ========== UPDATE ==========
export const UpdateBatch = z.object({
  id: z.string().uuid(), // required to identify which batch to update
  name: z.string().min(2).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  branch: z.string().min(2).optional(),
});

// ========== DELETE ==========
export const DeleteBatch = z.object({
  id: z.string().uuid(),
});

// ========== TYPES ==========
export type BatchCreationSchema = z.infer<typeof CreateBatch>;
export type BatchUpdationSchema = z.infer<typeof UpdateBatch>;
export type BatchDeletionSchema = z.infer<typeof DeleteBatch>;

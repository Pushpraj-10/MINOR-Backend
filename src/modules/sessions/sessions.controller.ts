import { Request, Response } from "express";
import { sessionCreationSchema, sessionUpdationSchema, sessionDeletionSchema } from "./sessions.validation";
import { SessionService } from "./sessions.service";

// ========== CREATE SESSION ==========
export async function createSession(req: Request, res: Response) {
  try {
    const parsed = sessionCreationSchema.parse(req.body);
    const session = await SessionService.createSession(parsed);
    res.status(201).json(session);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== UPDATE SESSION ==========
export async function updateSession(req: Request, res: Response) {
  try {
    const { id } = req.params; // session id comes from URL
    const parsed = sessionUpdationSchema.parse({ ...req.body, id }); // merge id into body for validation

    const updatedSession = await SessionService.updateSession(parsed);
    res.json(updatedSession);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== DELETE SESSION ==========
export async function deleteSession(req: Request, res: Response) {
  try {
    const { id } = req.params; // session id comes from URL
    const parsed = sessionDeletionSchema.parse({ id });

    const result = await SessionService.deleteSession(parsed);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
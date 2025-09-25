import { Request, Response } from "express";
import { CreateProfessorAssignment,
  UpdateProfessorAssignment,
  DeleteProfessorAssignment,
  GenerateSessionQR,
  GetProfessorCourseOfferings,
} from "./professor.validation";
import { ProfessorService } from "./professor.service";

// ========== CREATE PROFESSOR ASSIGNMENT ==========
export async function createProfessorAssignment(req: Request, res: Response) {
  try {
    const parsed = CreateProfessorAssignment.parse(req.body);
    const assignment = await ProfessorService.createProfessorAssignment(parsed);
    res.status(201).json(assignment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== UPDATE PROFESSOR ASSIGNMENT ==========
export async function updateProfessorAssignment(req: Request, res: Response) {
  try {
    const { id } = req.params; // assignment id from URL
    const parsed = UpdateProfessorAssignment.parse({ ...req.body, id });

    const { id: _, ...updateData } = parsed; // exclude id from update
    const updatedAssignment = await ProfessorService.updateProfessorAssignment(
      id,
      updateData
    );
    res.json(updatedAssignment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== DELETE PROFESSOR ASSIGNMENT ==========
export async function deleteProfessorAssignment(req: Request, res: Response) {
  try {
    const { id } = req.params; // assignment id from URL
    const parsed = DeleteProfessorAssignment.parse({ id });

    const result = await ProfessorService.deleteProfessorAssignment(parsed.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== GENERATE SESSION QR-TOKEN ==========
export async function generateSessionQR(req: Request, res: Response) {
  try {
    const parsed = GenerateSessionQR.parse(req.body);

    const qrToken = await ProfessorService.generateToken(parsed);

    res.status(201).json(qrToken);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}


// ========== GET PROFESSOR COURSE OFFERINGS ==========
export async function getProfessorCourseOfferings(req: Request, res: Response) {
  try {
    // Validate request params with Zod
    const parsed = GetProfessorCourseOfferings.parse(req.params);

    // Pass the validated object to the service
    const offerings = await ProfessorService.getProfessorCourseOfferings(parsed);

    res.json(offerings);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
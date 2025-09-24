import { Request, Response } from "express";
import {
  CreateStudentCourseRegistration,
  UpdateStudentCourseRegistration,
  DeleteStudentCourseRegistration,
  markAttendanceSchema
} from "./student.validation";
import { StudentService } from "./student.service";

// ========== CREATE ==========
export async function createRegistration(req: Request, res: Response) {
  try {
    const parsed = CreateStudentCourseRegistration.parse(req.body);
    const registration = await StudentService.createRegistration(parsed);
    res.status(201).json(registration);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== UPDATE ==========
export async function updateRegistration(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const parsed = UpdateStudentCourseRegistration.parse({ ...req.body, id });

    const { id: _, ...updateData } = parsed;
    const updatedRegistration = await StudentService.updateRegistration(id, updateData);
    res.json(updatedRegistration);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== DELETE ==========
export async function deleteRegistration(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const parsed = DeleteStudentCourseRegistration.parse({ id });

    const result = await StudentService.deleteRegistration(parsed.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function markAttendance(req: Request, res: Response) {
  try {
    const parsed = markAttendanceSchema.parse(req.body); // token will come as query param
    const studentId = req.user?.id; // from auth middleware

    if (!studentId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const record = await StudentService.markAttendance(studentId, parsed);
    res.status(201).json(record);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
import { Request, Response } from "express";
import {
  CreateCourseOffering,
  UpdateCourseOffering,
  DeleteCourseOffering,
} from "./courseOffer.validation";
import { CourseOfferingService } from "./courseOffer.service";

// ========== CREATE COURSE OFFERING ==========
export async function createCourseOffering(req: Request, res: Response) {
  try {
    const parsed = CreateCourseOffering.parse(req.body);
    const offering = await CourseOfferingService.createCourseOffering(parsed);
    res.status(201).json(offering);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== UPDATE COURSE OFFERING ==========
export async function updateCourseOffering(req: Request, res: Response) {
  try {
    const { id } = req.params; // get offering id from URL
    const parsed = UpdateCourseOffering.parse({ ...req.body, id }); // merge id for validation

    const { id: _, ...updateData } = parsed; // exclude id from update data
    const updatedOffering = await CourseOfferingService.updateCourseOffering(
      id,
      updateData
    );
    res.json(updatedOffering);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== DELETE COURSE OFFERING ==========
export async function deleteCourseOffering(req: Request, res: Response) {
  try {
    const { id } = req.params; // get offering id from URL
    const parsed = DeleteCourseOffering.parse({ id });

    const result = await CourseOfferingService.deleteCourseOffering(parsed.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

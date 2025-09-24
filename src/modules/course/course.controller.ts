import { Request, Response } from "express"; 
import { CreateCourse, UpdateCourse, DeleteCourse } from "./course.validation";
import { CourseService } from "./course.service";


export async function createCourse(req: Request, res: Response) {
  try {
    const parsed = CreateCourse.parse(req.body);
    const course = await CourseService.createCourse(parsed);
    res.status(201).json(course);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}


export async function updateCourse(req: Request, res: Response) {
  try {
    const code = req.params.code; // get course code from URL
    const parsed = UpdateCourse.parse(req.body);

    // Exclude code from parsed data if present
    const { code: _, ...updateData } = parsed;

    const updatedCourse = await CourseService.updateCourse(code, updateData);
    res.json(updatedCourse);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}


export async function deleteCourse(req: Request, res: Response) {
  try {
    const code = req.params.code; // get course code from URL
    const result = await CourseService.deleteCourse(code);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

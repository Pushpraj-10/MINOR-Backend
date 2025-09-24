import prisma from "../../config/prisma";
import { CourseCreationSchema, CourseUpdationSchema, CourseDeletionSchema } from "./course.validation";


export class CourseService {

  static async createCourse(data: CourseCreationSchema) {
    const existing = await prisma.course.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new Error("Course code already exists");
    }

    const course = await prisma.course.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        credits: data.credits ?? 0,
      },
    });

    return course;
  }

  // ========== UPDATE COURSE ==========
  static async updateCourse(code: string, data: Omit<CourseUpdationSchema, "code">) {
    const existing = await prisma.course.findUnique({
      where: { code },
    });

    if (!existing) {
      throw new Error("Course not found");
    }

    const updated = await prisma.course.update({
      where: { code },
      data, // only fields to update
    });

    return updated;
  }

  // ========== DELETE COURSE ==========
  static async deleteCourse(code: string) {
    const existing = await prisma.course.findUnique({
      where: { code },
    });

    if (!existing) {
      throw new Error("Course not found");
    }

    await prisma.course.delete({
      where: { code },
    });

    return { message: "Course deleted successfully" };
  }

}
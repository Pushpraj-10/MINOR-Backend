import prisma from "../../config/prisma";
import { CourseOfferingCreationSchema, CourseOfferingUpdationSchema, CourseOfferingDeletionSchema } from "./courseOffer.validation";

export class CourseOfferingService {
  // ========== CREATE COURSE OFFERING ==========
  static async createCourseOffering(data: CourseOfferingCreationSchema) {
    // check if a course offering already exists for same course, batch, and semester
    const existing = await prisma.courseOffering.findUnique({
      where: {
        courseId_batchId_semester: {
          courseId: data.courseId,
          batchId: data.batchId,
          semester: data.semester,
        },
      },
    });

    if (existing) {
      throw new Error("Course offering already exists for this course, batch, and semester");
    }

    const offering = await prisma.courseOffering.create({
      data: {
        courseId: data.courseId,
        batchId: data.batchId,
        semester: data.semester,
      },
    });

    return offering;
  }

  // ========== UPDATE COURSE OFFERING ==========
  static async updateCourseOffering(id: string, data: Omit<CourseOfferingUpdationSchema, "id">) {
    const existing = await prisma.courseOffering.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Course offering not found");
    }

    const updated = await prisma.courseOffering.update({
      where: { id },
      data,
    });

    return updated;
  }

  // ========== DELETE COURSE OFFERING ==========
  static async deleteCourseOffering(id: string) {
    const existing = await prisma.courseOffering.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Course offering not found");
    }

    await prisma.courseOffering.delete({
      where: { id },
    });

    return { message: "Course offering deleted successfully" };
  }
}

import { randomUUID } from "crypto";
import prisma from "../../config/prisma";
import {
  ProfessorAssignmentCreationSchema,
  ProfessorAssignmentUpdationSchema,
  ProfessorAssignmentDeletionSchema,
  GenerateSessionQRSchema,
  GetProfessorCourseOfferingsSchema,
} from "./professor.validation";

export class ProfessorService {
  // ========== CREATE ==========
  static async createProfessorAssignment(
    data: ProfessorAssignmentCreationSchema
  ) {
    // check if the professor is already assigned to the offering
    const existing = await prisma.professorAssignment.findUnique({
      where: {
        professorId_offeringId: {
          professorId: data.professorId,
          offeringId: data.offeringId,
        },
      },
    });

    if (existing) {
      throw new Error("Professor is already assigned to this offering");
    }

    const assignment = await prisma.professorAssignment.create({
      data: {
        professorId: data.professorId,
        offeringId: data.offeringId,
      },
    });

    return assignment;
  }

  // ========== UPDATE ==========
  static async updateProfessorAssignment(
    id: string,
    data: Omit<ProfessorAssignmentUpdationSchema, "id">
  ) {
    const existing = await prisma.professorAssignment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Professor assignment not found");
    }

    const updated = await prisma.professorAssignment.update({
      where: { id },
      data,
    });

    return updated;
  }

  // ========== DELETE ==========
  static async deleteProfessorAssignment(id: string) {
    const existing = await prisma.professorAssignment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Professor assignment not found");
    }

    await prisma.professorAssignment.delete({
      where: { id },
    });

    return { message: "Professor assignment deleted successfully" };
  }

  // ====== GENERATE SESSION QR-TOKEN ======
  static async generateToken(data: GenerateSessionQRSchema) {
    // Ensure session exists
    const session = await prisma.classSession.findUnique({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    // Generate a unique token string
    const token = randomUUID();

    // Save to DB
    const qrToken = await prisma.qRToken.create({
      data: {
        sessionId: data.sessionId,
        token,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        maxUses: data.maxUses ?? 0,
      },
    });

    return qrToken;
  }

  // ====== FETCHING COURSES ======
  static async getProfessorCourseOfferings(
  data: GetProfessorCourseOfferingsSchema) {
  const { professorId } = data;

  const assignments = await prisma.professorAssignment.findMany({
    where: { professorId },
    include: {
      offering: {
        include: {
          course: true, // course details (Course table)
          batch: true,  // batch details
        },
      },
    },
  });

  // Transform into a clean DTO
  const offerings = assignments.map((assignment) => ({
    offeringId: assignment.offering.id,
    semester: assignment.offering.semester,
    createdAt: assignment.offering.createdAt,
    course: assignment.offering.course,
    batch: assignment.offering.batch,
  }));

  return offerings;
}
}

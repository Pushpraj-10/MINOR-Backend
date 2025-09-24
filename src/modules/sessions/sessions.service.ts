import prisma from "../../config/prisma";
import { SessionCreation, SessionUpdation, SessionDeletion } from "./sessions.validation";


export class SessionService {
  // ========== CREATE SESSION ==========
  static async createSession(data: SessionCreation) {
    // check for duplicate session (based on unique constraint)
    const existing = await prisma.classSession.findUnique({
      where: {
        offeringId_professorId_sessionDate: {
          offeringId: data.offeringId,
          professorId: data.professorId,
          sessionDate: new Date(data.sessionDate),
        },
      },
    });

    if (existing) {
      throw new Error("Session already exists for this professor on this date");
    }

    const session = await prisma.classSession.create({
      data: {
        offeringId: data.offeringId,
        professorId: data.professorId,
        sessionDate: new Date(data.sessionDate),
        topic: data.topic,
      },
    });

    return session;
  }

  // ========== UPDATE SESSION ==========
  static async updateSession(data: SessionUpdation) {
    const existing = await prisma.classSession.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new Error("Session not found");
    }

    const { id, ...updateData } = data;

    const updated = await prisma.classSession.update({
      where: { id },
      data: {
        ...updateData,
        sessionDate: updateData.sessionDate ? new Date(updateData.sessionDate) : undefined,
      },
    });

    return updated;
  }

  // ========== DELETE SESSION ==========
  static async deleteSession(data: SessionDeletion) {
    const existing = await prisma.classSession.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new Error("Session not found");
    }

    await prisma.classSession.delete({
      where: { id: data.id },
    });

    return { message: "Session deleted successfully" };
  }
}
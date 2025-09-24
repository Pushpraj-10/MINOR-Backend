import prisma from "../../config/prisma";
import {
  StudentCourseRegistrationCreationSchema,
  StudentCourseRegistrationUpdationSchema,
  StudentCourseRegistrationDeletionSchema,
  MarkingAttendanceSchema
} from "./student.validation";

export class StudentService {
  // ========== CREATE ==========
  static async createRegistration(data: StudentCourseRegistrationCreationSchema) {
    const existing = await prisma.studentCourseRegistration.findUnique({
      where: {
        studentId_offeringId: {
          studentId: data.studentId,
          offeringId: data.offeringId,
        },
      },
    });

    if (existing) {
      throw new Error("Student already registered for this offering");
    }

    const registration = await prisma.studentCourseRegistration.create({
      data: {
        studentId: data.studentId,
        offeringId: data.offeringId,
      },
    });

    return registration;
  }

  // ========== UPDATE ==========
  static async updateRegistration(
    id: string,
    data: Omit<StudentCourseRegistrationUpdationSchema, "id">
  ) {
    const existing = await prisma.studentCourseRegistration.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Registration not found");
    }

    const updated = await prisma.studentCourseRegistration.update({
      where: { id },
      data,
    });

    return updated;
  }

  // ========== DELETE ==========
  static async deleteRegistration(id: string) {
    const existing = await prisma.studentCourseRegistration.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Registration not found");
    }

    await prisma.studentCourseRegistration.delete({
      where: { id },
    });

    return { message: "Registration deleted successfully" };
  }

  // ========== ATTENDANCE ==========
  static async markAttendance(studentId: string, data: MarkingAttendanceSchema) {
    // 1. Find QR token
    const qrToken = await prisma.qRToken.findUnique({
      where: { token: data.token },
    });

    if (!qrToken) {
      throw new Error("Invalid QR token");
    }

    // 2. Validate token time
    const now = new Date();
    if (qrToken.validUntil && qrToken.validUntil < now) {
      throw new Error("QR token expired");
    }
    if (qrToken.validFrom > now) {
      throw new Error("QR token not active yet");
    }

    // 3. Ensure student not already marked
    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: qrToken.sessionId,
          studentId,
        },
      },
    });

    if (existing) {
      throw new Error("Attendance already marked for this session");
    }

    // 4. Create attendance record
    const record = await prisma.attendanceRecord.create({
      data: {
        sessionId: qrToken.sessionId,
        studentId,
        status: "present",
        source: "qr",
        markedById: studentId,
      },
    });

    return record;
  }
}

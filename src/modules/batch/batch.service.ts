import prisma from "../../config/prisma";
import { BatchCreationSchema, BatchUpdationSchema } from "./batch.validation";

export class BatchService {
  // ========== CREATE ==========
  static async createBatch(data: BatchCreationSchema) {
    // check if batch with same name already exists
    const existing = await prisma.batch.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new Error("Batch name already exists");
    }

    const batch = await prisma.batch.create({
      data: {
        name: data.name,
        year: data.year,
        branch: data.branch,
      },
    });

    return batch;
  }

  // ========== UPDATE ==========
  static async updateBatch(id: string, data: Omit<BatchUpdationSchema, "id">) {
    const existing = await prisma.batch.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Batch not found");
    }

    const updated = await prisma.batch.update({
      where: { id },
      data,
    });

    return updated;
  }

  // ========== DELETE ==========
  static async deleteBatch(id: string) {
    const existing = await prisma.batch.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Batch not found");
    }

    await prisma.batch.delete({
      where: { id },
    });

    return { message: "Batch deleted successfully" };
  }
}

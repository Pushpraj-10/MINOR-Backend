import { Request, Response } from "express";
import { CreateBatch, UpdateBatch, DeleteBatch } from "./batch.validation";
import { BatchService } from "./batch.service";

// ========== CREATE BATCH ==========
export async function createBatch(req: Request, res: Response) {
  try {
    const parsed = CreateBatch.parse(req.body);
    const batch = await BatchService.createBatch(parsed);
    res.status(201).json(batch);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== UPDATE BATCH ==========
export async function updateBatch(req: Request, res: Response) {
  try {
    const { id } = req.params; // batch id comes from URL
    const parsed = UpdateBatch.parse({ ...req.body, id }); // merge id with body for validation

    const { id: batchId, ...updateData } = parsed;
    const updatedBatch = await BatchService.updateBatch(batchId, updateData);
    res.json(updatedBatch);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ========== DELETE BATCH ==========
export async function deleteBatch(req: Request, res: Response) {
  try {
    const { id } = req.params; // batch id comes from URL
    const parsed = DeleteBatch.parse({ id });

    const result = await BatchService.deleteBatch(parsed.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

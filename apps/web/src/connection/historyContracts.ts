import { z } from "zod";
import { money } from "./contracts";

export const alertNames = { unread: "Não lido", read: "Lido", resolved: "Resolvido" };
export const importNames = { received: "Recebida", processing: "Processando", applied: "Aplicada", failed: "Falhou" };

export const removalAlertSchema = z.object({
  id: z.string().uuid(),
  labelId: z.string().uuid(),
  productName: z.string(),
  displayAmount: money,
  status: z.enum(["unread", "read", "resolved"]),
  createdAt: z.string(),
  removalDueAt: z.string().nullable(),
});

export const importRunSchema = z.object({
  id: z.string().uuid(),
  sourceSystem: z.string(),
  status: z.enum(["received", "processing", "applied", "failed"]),
  rowsReceived: z.number(),
  pricesChanged: z.number(),
  errorSummary: z.string().nullable(),
  createdAt: z.string(),
});

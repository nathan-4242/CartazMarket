import { z } from "zod";

export const money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
export const productSchema = z.object({
  productId:z.string().uuid(),name:z.string(),unit:z.string(),
  currentAmount:money,currency:z.literal("BRL"),priceUpdatedAt:z.string(),
});
export const promotionSchema = z.object({
  id:z.string().uuid(),productId:z.string().uuid(),productName:z.string(),
  regularAmount:money,promotionalAmount:money,startsAt:z.string(),endsAt:z.string(),
  status:z.enum(["scheduled","active","expired","cancelled"]),
});
export const labelCoreSchema = z.object({
  id:z.string().uuid(),productId:z.string().uuid(),promotionId:z.string().uuid().nullable(),
  regularAmount:money,displayAmount:money,promotionStartsAt:z.string().nullable(),removalDueAt:z.string().nullable(),
  status:z.enum(["ready_to_print","printed","removed","cancelled"]),createdAt:z.string(),
});
export const labelSchema = labelCoreSchema.extend({productName:z.string(),unit:z.string()});
export const identitySchema = z.object({
  user:z.object({userId:z.string().uuid(),email:z.string().nullable()}),
  organizations:z.array(z.object({organizationId:z.string().uuid(),organizationName:z.string(),role:z.enum(["owner","manager","operator"])})),
});
export const sourceSchema = z.object({
  storeId:z.string().uuid(),userId:z.string().uuid(),labelId:z.string().uuid(),productId:z.string().uuid(),
});
export type Product = z.infer<typeof productSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type Source = z.infer<typeof sourceSchema>;

export function decimalToBrazilian(value: string) {
  const [whole,fraction=""] = money.parse(value).split(".");
  return whole!.replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+fraction.padEnd(2,"0");
}

export function decimalToCents(value: string) {
  const [whole,fraction=""] = money.parse(value).split(".");
  return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,"0"));
}

export const promotionNames: Record<Promotion["status"],string> = {scheduled:"Agendada",active:"Ativa",expired:"Encerrada",cancelled:"Cancelada"};
export const labelNames: Record<Label["status"],string> = {ready_to_print:"Aguardando impressão",printed:"Impresso",removed:"Retirado",cancelled:"Cancelado"};

import Joi from "joi";
import type { NextApiRequest, NextApiResponse } from "next";

const orderSchema = Joi.object({ sku: Joi.string().required(), qty: Joi.number().min(1) });

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  const { error, value } = orderSchema.validate(req.body);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  saveOrder(value);
  res.status(200).json({ ok: true });
}

declare function saveOrder(order: unknown): void;

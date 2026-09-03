import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  const order = req.body;
  saveOrder(order);
  res.status(200).json({ ok: true });
}

declare function saveOrder(order: unknown): void;

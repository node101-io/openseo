import { Request, Response } from "express";
import { Website } from "../../../models/website/Website";

export const createWebsite = async (req: Request, res: Response) => {
  try {
    const { url, searchParams } = req.body;

    const newWebsiteId = await Website.createWebsite(url, searchParams);

    return res.status(201).json({
      message: "Website successfully created.",
      data: { _id: newWebsiteId },
    });
  } catch (error: any) {
    return res.status(400).json({
      message: error.message,
      error: "Internal server error.",
    });
  }
};

import { Router } from "express";
import { createWebsite } from "../controllers/website/create/post";

const router = Router();

router.post("/", createWebsite);

export default router;

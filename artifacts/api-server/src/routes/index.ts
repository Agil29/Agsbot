import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminPackagesRouter from "./admin/packages";
import webhookRouter from "./webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminPackagesRouter);
router.use("/webhook", webhookRouter);

export default router;

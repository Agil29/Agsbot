import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminPackagesRouter from "./admin/packages";
import adminSettingsRouter from "./admin/settings";
import adminBroadcastRouter from "./admin/broadcast";
import webhookRouter from "./webhook";
import dopuCallbackRouter from "./dopuCallback";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminPackagesRouter);
router.use("/admin", adminSettingsRouter);
router.use("/admin", adminBroadcastRouter);
router.use("/webhook", webhookRouter);
router.use(dopuCallbackRouter);

export default router;

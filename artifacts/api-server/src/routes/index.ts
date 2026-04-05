import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminPackagesRouter from "./admin/packages";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminPackagesRouter);

export default router;

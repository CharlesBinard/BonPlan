import type { Config } from "@bonplan/shared";
import type Redis from "ioredis";
import type { Scheduler } from "./services/scheduler";

export type ConsumerDeps = {
	db: ReturnType<typeof import("@bonplan/shared")["createDb"]>["db"];
	redis: Redis;
	config: Config;
	scheduler: Scheduler;
};

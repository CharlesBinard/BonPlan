type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
	debug: (msg: string, data?: Record<string, unknown>) => void;
	info: (msg: string, data?: Record<string, unknown>) => void;
	warn: (msg: string, data?: Record<string, unknown>) => void;
	error: (msg: string, data?: Record<string, unknown>) => void;
	security: (event: string, data?: Record<string, unknown>) => void;
};

const write = (level: LogLevel, service: string, msg: string, extra?: Record<string, unknown>): void => {
	const entry = {
		timestamp: new Date().toISOString(),
		level,
		service,
		msg,
		...extra,
	};
	process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export const createLogger = (service: string): Logger => ({
	debug: (msg, data) => write("debug", service, msg, data),
	info: (msg, data) => write("info", service, msg, data),
	warn: (msg, data) => write("warn", service, msg, data),
	error: (msg, data) => write("error", service, msg, data),
	security: (event, data) => write("warn", service, event, { ...data, category: "security", event }),
});

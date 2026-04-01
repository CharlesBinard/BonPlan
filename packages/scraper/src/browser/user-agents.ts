// Must match the actual Chrome version in the docker container to avoid fingerprint mismatch
export const CHROME_VERSION = "146";

export const USER_AGENTS = [
	`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
	`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
	`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
];

export const getRandomUserAgent = (): string => {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;
};

import { defineConfig } from "orval";

export default defineConfig({
	bonplan: {
		input: {
			target: "http://localhost:3000/openapi.json",
		},
		output: {
			target: "./src/api/generated",
			client: "react-query",
			mode: "split",
			override: {
				mutator: {
					path: "./src/config/api-mutator.ts",
					name: "customFetch",
				},
				query: {
					useQuery: true,
					useInfinite: true,
					useMutation: true,
				},
			},
		},
	},
});

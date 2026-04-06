import { z } from "zod";

export const loginSchema = z.object({
	email: z.string().email("Email invalide"),
	password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = z
	.object({
		name: z.string().min(1, "Nom requis"),
		email: z.string().email("Email invalide"),
		password: z
			.string()
			.min(8, "Minimum 8 caractères")
			.regex(/[a-zA-Z]/, "Doit contenir au moins une lettre")
			.regex(/[0-9]/, "Doit contenir au moins un chiffre"),
		confirmPassword: z.string(),
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: "Les mots de passe ne correspondent pas",
		path: ["confirmPassword"],
	});

export const searchCreateSchema = z.object({
	query: z.string().min(3, "Minimum 3 caractères").max(500),
	location: z.string().max(500).default(""),
	postcode: z.string().max(10).optional().nullable(),
	latitude: z.number().min(-90).max(90).optional().nullable(),
	longitude: z.number().min(-180).max(180).optional().nullable(),
	radiusKm: z.number().int().min(1).max(500).default(30),
	intervalMin: z.number().int().min(5).max(1440).default(15),
	minScore: z.number().int().min(0).max(100).default(70),
	allowBundles: z.boolean().default(false),
});

export const searchUpdateSchema = z.object({
	intervalMin: z.number().int().min(5).max(1440).optional(),
	minScore: z.number().int().min(0).max(100).optional(),
	status: z.enum(["active", "paused"]).optional(),
});

export const apiKeySchema = z.object({
	aiApiKey: z.string().min(1, "Clé API requise"),
	currentPassword: z.string().min(1, "Mot de passe requis"),
});

export const passwordChangeSchema = z
	.object({
		currentPassword: z.string().min(1),
		newPassword: z
			.string()
			.min(8, "Minimum 8 caractères")
			.regex(/[a-zA-Z]/, "Doit contenir au moins une lettre")
			.regex(/[0-9]/, "Doit contenir au moins un chiffre"),
		confirmPassword: z.string(),
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		message: "Les mots de passe ne correspondent pas",
		path: ["confirmPassword"],
	});

export const discordVerifySchema = z.object({
	code: z.string().length(6, "Le code doit faire 6 caractères"),
});

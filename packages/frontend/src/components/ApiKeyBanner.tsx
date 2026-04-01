import { TriangleAlertIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ApiKeyBannerProps = { hasApiKey: boolean; aiProvider?: string };

export const ApiKeyBanner = ({ hasApiKey }: ApiKeyBannerProps) => {
	if (hasApiKey !== false) return null;

	return (
		<Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
			<TriangleAlertIcon className="size-4 text-yellow-600 dark:text-yellow-400" />
			<AlertTitle className="text-yellow-800 dark:text-yellow-300">Clé API manquante</AlertTitle>
			<AlertDescription className="text-yellow-700 dark:text-yellow-400">
				Configurez votre fournisseur et cle API dans les parametres pour commencer.
			</AlertDescription>
			<AlertAction>
				<Link to="/settings">
					<Button size="sm" variant="outline">
						Configurer
					</Button>
				</Link>
			</AlertAction>
		</Alert>
	);
};

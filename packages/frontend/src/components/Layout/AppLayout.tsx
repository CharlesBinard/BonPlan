import type { ReactNode } from "react";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const AppLayout = ({ children }: { children: ReactNode }) => (
	<div className="flex h-screen overflow-hidden">
		{/* Sidebar: visible on lg+ */}
		<div className="hidden lg:flex lg:flex-shrink-0">
			<Sidebar />
		</div>

		{/* Main area */}
		<div className="flex flex-1 flex-col overflow-hidden">
			<TopBar />
			<main className="flex-1 overflow-y-auto p-4 pb-20 lg:pb-4">{children}</main>
			{/* Bottom nav: visible on mobile only */}
			<div className="lg:hidden">
				<MobileNav />
			</div>
		</div>
	</div>
);

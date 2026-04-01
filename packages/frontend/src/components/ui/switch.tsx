"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input dark:data-[unchecked]:bg-input/80",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };

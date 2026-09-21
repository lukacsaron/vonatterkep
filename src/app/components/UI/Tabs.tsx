'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

// Radix Tabs implements the ARIA tabs pattern: role=tablist/tab/tabpanel,
// aria-selected, aria-controls <-> aria-labelledby between each tab and its
// panel, and a roving tabindex with arrow-key / Home / End navigation.
// For those references to resolve, render a (Styled)TabsContent for every tab
// (forceMount + hidden keeps the inactive panel in the DOM), and name the
// TabsList with aria-label or aria-labelledby.

const Tabs = TabsPrimitive.Root;

const TabsList = TabsPrimitive.List;

const TabsTrigger = TabsPrimitive.Trigger;

const TabsContent = TabsPrimitive.Content;

export { Tabs, TabsList, TabsTrigger, TabsContent };

// Styled versions for better UX
export const StyledTabsList = ({ className, ...props }: React.ComponentProps<typeof TabsList>) => (
  <TabsList
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600 w-full',
      className
    )}
    {...props}
  />
);

export const StyledTabsTrigger = ({ className, ...props }: React.ComponentProps<typeof TabsTrigger>) => (
  <TabsTrigger
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-gray-950 data-[state=active]:shadow-sm flex-1',
      className
    )}
    {...props}
  />
);

export const StyledTabsContent = ({ className, ...props }: React.ComponentProps<typeof TabsContent>) => (
  <TabsContent
    className={cn(
      'mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
);
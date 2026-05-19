import {
  LayoutDashboard,
  MessageSquare,
  Repeat,
  LineChart,
  PieChart,
  Plug,
  Cpu,
  Network,
  Wallet,
  Bell,
  Users,
  Landmark,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

/** Full workspace navigation — desktop sidebar and mobile drawer. */
export const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/dashboard/charts", label: "Charts", Icon: PieChart },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/dashboard/subscriptions", label: "Recurring", Icon: Repeat },
  { href: "/dashboard/investments", label: "Holdings", Icon: LineChart },
  { href: "/alerts", label: "Alerts", Icon: Bell },
];

export const SETTINGS_NAV: NavItem[] = [
  { href: "/settings/connections", label: "Connections", Icon: Plug },
  { href: "/settings/accounts", label: "Accounts", Icon: Landmark },
  { href: "/settings/budgets", label: "Budgets", Icon: Wallet },
  { href: "/settings/household", label: "Household", Icon: Users },
  { href: "/settings/llm", label: "Models", Icon: Cpu },
  { href: "/settings/mcp", label: "MCP", Icon: Network },
];

/** Bottom-bar destinations. Five slots — drawer lives on the AppBar hamburger,
 *  no duplicate "More" button here. */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/dashboard/charts", label: "Charts", Icon: PieChart },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/dashboard/subscriptions", label: "Recurring", Icon: Repeat },
  { href: "/dashboard/investments", label: "Holdings", Icon: LineChart },
];

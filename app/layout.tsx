import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "OneAddress Riviera CRM",
  description: "CRM interne pour OneAddress Riviera"
};

const themeBootstrapScript = `
  try {
    var savedTheme = window.localStorage.getItem("oneaddress-riviera-crm-theme-v1");
    var theme = savedTheme === "light" ? "light" : "dark";
    document.documentElement.dataset.crmTheme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.crmTheme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}

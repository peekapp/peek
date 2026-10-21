"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { defaultTheme, isLightTheme, type Theme } from "@peek/core/themes";

const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: (_: Theme) => {},
});
export const useAppTheme = () => useContext(ThemeContext);
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", !isLightTheme(theme));
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

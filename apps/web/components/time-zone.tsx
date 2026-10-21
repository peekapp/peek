"use client";
import { createContext, useContext } from "react";
export const InstallationTimeZone = createContext("UTC");
export const useInstallationTimeZone = () => useContext(InstallationTimeZone);
export function TimeZoneProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <InstallationTimeZone.Provider value={value}>
      {children}
    </InstallationTimeZone.Provider>
  );
}

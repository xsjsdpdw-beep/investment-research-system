import { useEffect, useState } from "react";
import { APP_STORAGE_KEYS } from "@/lib/app-config";

// 默认呈现暗色暖橙；用户可切亮色，选择存 localStorage。
// 机制：亮色时给 <html> 加 .light（暗色为无类名的默认态）。
export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(APP_STORAGE_KEYS.theme);
    if (saved) return saved === "dark";
    return true; // 默认暗色
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(APP_STORAGE_KEYS.theme, dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

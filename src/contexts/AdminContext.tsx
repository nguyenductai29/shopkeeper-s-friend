import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const ADMIN_PASSWORD = "admin";
const STORAGE_KEY = "shop_admin_unlocked";

type AdminCtx = {
  isAdmin: boolean;
  unlock: (pwd: string) => boolean;
  lock: () => void;
};

const Ctx = createContext<AdminCtx | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const unlock = (pwd: string) => {
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const lock = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsAdmin(false);
  };

  return <Ctx.Provider value={{ isAdmin, unlock, lock }}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin must be used inside AdminProvider");
  return c;
}
